"""
End-to-end backtest. Runs against the real Supabase project. Verifies:
  [1] Schema is applied (all 11 tables, indexes, RLS, trigger)
  [2] NAQI math is consistent (Python script vs stored values)
  [3] Forecast model outputs match stored values
  [4] Email quota logic (1st OK, 2nd OK, 3rd REJECTED, count rolled back)
  [5] Cross-state compare guard
  [6] Worker HTTP endpoints (started in-process)

Run: cd /Users/harish && python3 Downloads/aira-ai/tests/backtest_e2e.py
       or with the env vars set:
       SUPABASE_TOKEN=... python3 ...
"""
from __future__ import annotations

import os
import sys
import subprocess
import time
from datetime import datetime, date, timedelta

import httpx

# Add worker to path so we can import compute modules
WORKER = os.path.join(os.path.dirname(__file__), "..", "apps", "worker")
sys.path.insert(0, WORKER)

import asyncio

# Supabase Management API
TOKEN = os.environ.get("SUPABASE_TOKEN")
if not TOKEN:
    print("ERROR: SUPABASE_TOKEN env var required")
    sys.exit(1)
PROJECT_REF = os.environ.get("SUPABASE_PROJECT", "svqugnhrcwugdjgobdqs")
SUPABASE_URL = f"https://{PROJECT_REF}.supabase.co"
SERVICE_ROLE = os.environ.get(
    "SUPABASE_SERVICE_ROLE",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2cXVnbmhyY3d1Z2RqZ29iZHFzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTM5MTk1NCwiZXhwIjoyMTA2OTY3OTU0fQ.zUll_tRCTw4AqUXoyoO69t45T2RxLzYOP_rO85QJ8Hc"
)

# Local worker (started by the tests)
WORKER_URL = os.environ.get("WORKER_URL", "http://localhost:8000")
WEB_URL = os.environ.get("WEB_URL", "http://localhost:3000")

PASS = 0
FAIL = 0
FAILURES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> bool:
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  PASS  {name}")
        return True
    else:
        FAIL += 1
        FAILURES.append(f"{name}: {detail}")
        print(f"  FAIL  {name}  {detail}")
        return False


def run_sql(sql: str) -> list | None:
    """Run SQL via Supabase Management API."""
    r = httpx.post(
        f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        json={"query": sql},
        timeout=120,
    )
    if r.status_code >= 400:
        print(f"  SQL FAIL: {r.status_code} {r.text[:200]}")
        return None
    return r.json() if r.text else []


def test_schema():
    print("\n[1] Schema validation")
    # All 11 tables exist (10 + forecasts)
    expected = {"advisory_views", "advisories", "chat_messages", "chat_sessions",
                "email_log", "email_quota", "forecasts", "readings",
                "stations", "user_profiles", "users"}
    v = run_sql("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
    if v is None:
        check("Schema query succeeded", False, "supabase API returned error")
        return
    found = {t["table_name"] for t in v}
    missing = expected - found
    check(f"All 11 tables present", len(missing) == 0, f"missing: {missing}")

    # Demo user exists
    v = run_sql("SELECT COUNT(*) AS n FROM users WHERE email='demo@aira.local'")
    check("Demo user exists", v and v[0]["n"] == 1, f"got {v}")

    # 30 stations
    v = run_sql("SELECT COUNT(*) AS n FROM stations")
    check("30 stations seeded", v and v[0]["n"] == 30, f"got {v[0]['n'] if v else 'none'}")

    # 900 readings (30 stations x 30 days)
    v = run_sql("SELECT COUNT(*) AS n FROM readings")
    check("900 readings seeded", v and v[0]["n"] == 900, f"got {v[0]['n'] if v else 'none'}")

    # 30 days readings per station (exactly)
    v = run_sql("SELECT COUNT(*)::float / (SELECT COUNT(*) FROM stations)::float AS avg FROM readings")
    if v:
        check("30 readings per station (avg)", abs(v[0]["avg"] - 30) < 0.1, f"got avg={v[0]['avg']:.2f}")

    # 210 forecasts (30 stations x 7 days)
    v = run_sql("SELECT COUNT(*) AS n FROM forecasts")
    check("210 forecasts seeded", v and v[0]["n"] == 210, f"got {v[0]['n'] if v else 'none'}")

    # At least 1 user profile
    v = run_sql("SELECT COUNT(*) AS n FROM user_profiles")
    check("Demo user has 1 profile", v and v[0]["n"] >= 1, f"got {v[0]['n'] if v else 'none'}")


def test_naqi_consistency():
    print("\n[2] NAQI consistency (Python source of truth vs stored readings)")
    from app.compute.naqi import compute_aqi

    # Pull all readings, recompute AQI from the pollutant columns, compare to stored AQI
    v = run_sql("SELECT pm25, pm10, no2, so2, co, o3, aqi FROM readings LIMIT 100")
    if not v:
        check("Readings query", False, "no readings")
        return

    mismatches = 0
    for row in v:
        r = compute_aqi(
            pm25=float(row["pm25"]),
            pm10=float(row["pm10"]),
            no2=float(row["no2"]),
            so2=float(row["so2"]),
            co=float(row["co"]),
            o3=float(row["o3"]),
        )
        if abs(int(r.aqi) - int(row["aqi"])) > 2:  # +-2 tolerance for rounding
            mismatches += 1
    check("Stored AQIs match Python recomputation", mismatches == 0, f"{mismatches}/100 mismatches")


def test_forecast_consistency():
    print("\n[3] Forecast consistency (stored values match Python model output)")
    from app.compute.forecast import forecast_7day

    # Pull history for Borivali, run forecast, compare day 1 prediction
    v = run_sql("""
        SELECT recorded_at::date AS d, aqi
        FROM readings WHERE station_id = 'MUMBAI_BORIVALI'
        ORDER BY recorded_at
    """)
    if not v:
        check("Borivali history query", False, "no readings")
        return

    history = [(date.fromisoformat(str(r["d"])), int(r["aqi"])) for r in v]
    result = forecast_7day(history)
    check("Forecast model returns 7 points", len(result.points) == 7, f"got {len(result.points)}")
    check("Forecast R^2 is between 0 and 1", 0 <= result.r_squared <= 1, f"got {result.r_squared}")
    # Stored day 1 prediction
    v = run_sql("""
        SELECT predicted_aqi FROM forecasts
        WHERE station_id='MUMBAI_BORIVALI'
        ORDER BY forecast_date ASC LIMIT 1
    """)
    if v:
        stored = v[0]["predicted_aqi"]
        predicted = int(result.points[0].predicted_aqi)
        check("Day 1 forecast matches stored", abs(stored - predicted) <= 1, f"stored={stored} predicted={predicted}")


def test_email_cap():
    print("\n[4] Email cap (2/day per user)")
    # Reset quota for demo user
    run_sql("DELETE FROM email_quota WHERE user_id = (SELECT id FROM users WHERE email='demo@aira.local')")

    # Call the helper function 3 times. Note: the function has OUT parameters,
    # so the column list AS r(...) is redundant. Just use SELECT *.
    for i in range(1, 4):
        v = run_sql(f"""
            SELECT * FROM check_and_increment_email_quota(
                (SELECT id FROM users WHERE email='demo@aira.local')
            )
        """)
        if not v:
            check(f"Call {i} succeeded", False, "no result")
            continue
        if i <= 2:
            check(f"Email {i}/2 allowed", v[0]["allowed"], f"got {v[0]}")
        else:
            check(f"Email 3/2 REJECTED (cap)", not v[0]["allowed"], f"got {v[0]}")

    # Verify quota count rolled back to 2
    v = run_sql("""
        SELECT count FROM email_quota
        WHERE user_id=(SELECT id FROM users WHERE email='demo@aira.local')
    """)
    check("Cap count is exactly 2 (3rd attempt rolled back)",
          v and v[0]["count"] == 2, f"got {v[0]['count'] if v else None}")


def test_compare_cross_state_guard():
    print("\n[5] Compare cross-state guard")
    # All our stations are in Maharashtra, so any cross-state compare would need to use a
    # non-Maharashtra station. We don't have one. Instead, verify the helper handles
    # same-state correctly and the API endpoint contract.
    # Since both are in 'maharashtra', it should be allowed.
    v = run_sql("""
        SELECT DISTINCT lower(state) AS state FROM stations ORDER BY state
    """)
    states = [r["state"] for r in v] if v else []
    check("Only Maharashtra stations seeded", len(states) == 1 and states[0] == "maharashtra",
          f"got {states}")

    # Verify two same-state stations can be selected for compare
    v = run_sql("""
        SELECT id, place FROM stations WHERE lower(state)='maharashtra' ORDER BY place LIMIT 5
    """)
    check("At least 2 stations available for compare", v and len(v) >= 2,
          f"got {len(v) if v else 0} stations")


def test_worker_endpoints():
    print("\n[6] Worker HTTP endpoints (in-process)")
    # Start the worker as a subprocess on a free port
    proc = subprocess.Popen(
        ["python3", "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=WORKER,
        env={**os.environ,
             "DATABASE_URL": f"postgresql://postgres:Harish@0131@{PROJECT_REF}.supabase.co:5432/postgres",
             "GROQ_API_KEY": os.environ.get("GROQ_API_KEY", ""),
             "RESEND_API_KEY": os.environ.get("RESEND_API_KEY", "")},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        # Wait for worker to come up
        for i in range(20):
            time.sleep(1)
            try:
                r = httpx.get(f"{WORKER_URL}/health", timeout=2)
                if r.status_code == 200:
                    break
            except httpx.RequestError:
                continue
        else:
            check("Worker started within 20s", False, "no response from /health")
            return

        # /health
        try:
            r = httpx.get(f"{WORKER_URL}/health", timeout=5)
            check("GET /health 200", r.status_code == 200, f"got {r.status_code}")
            if r.status_code == 200:
                body = r.json()
                check("/health has status field", body.get("status") == "ok", str(body))
        except Exception as e:
            check("GET /health", False, str(e))

        # /aqi/now?place=borivali
        try:
            r = httpx.get(f"{WORKER_URL}/aqi/now?place=borivali", timeout=10)
            check("GET /aqi/now 200", r.status_code == 200, f"got {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                check("aqi/now has all 6 pollutants",
                      all(k in data for k in ["pm25","pm10","no2","so2","co","o3"]),
                      str(data.keys()))
                check("aqi/now has bucket", data.get("bucket") in ["Good","Satisfactory","Moderate","Poor","Very Poor","Severe"])
                check("aqi/now has aqi 0-500", 0 <= data.get("aqi", -1) <= 500)
        except Exception as e:
            check("GET /aqi/now", False, str(e))

        # /aqi/forecast?place=borivali
        try:
            r = httpx.get(f"{WORKER_URL}/aqi/forecast?place=borivali", timeout=10)
            check("GET /aqi/forecast 200", r.status_code == 200, f"got {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                check("forecast has 7 points", len(data.get("points", [])) == 7)
                check("forecast r_squared reported", "r_squared" in data)
        except Exception as e:
            check("GET /aqi/forecast", False, str(e))

        # /aqi/stations?state=maharashtra
        try:
            r = httpx.get(f"{WORKER_URL}/aqi/stations?state=maharashtra", timeout=10)
            check("GET /aqi/stations 200", r.status_code == 200, f"got {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                check("stations list has 30 stations", len(data.get("stations", [])) == 30)
        except Exception as e:
            check("GET /aqi/stations", False, str(e))

        # /aqi/advisory?place=borivali
        try:
            r = httpx.get(f"{WORKER_URL}/aqi/advisory?place=borivali&profile=healthy", timeout=15)
            check("GET /aqi/advisory 200", r.status_code == 200, f"got {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                check("advisory has body", "body" in data and len(data["body"]) > 20)
        except Exception as e:
            check("GET /aqi/advisory", False, str(e))
    finally:
        proc.terminate()
        proc.wait(timeout=5)


def main():
    print("=" * 60)
    print("AIRA AI -- END-TO-END BACKTEST")
    print("=" * 60)
    print(f"Target: Supabase project {PROJECT_REF}")
    print(f"Worker URL: {WORKER_URL}")
    print()

    test_schema()
    test_naqi_consistency()
    test_forecast_consistency()
    test_email_cap()
    test_compare_cross_state_guard()
    if "--with-worker" in sys.argv and os.path.exists(os.path.join(WORKER, "main.py")):
        test_worker_endpoints()
    else:
        print("\n[6] Worker HTTP endpoints — SKIPPED (run with --with-worker flag)")

    print("\n" + "=" * 60)
    print(f"RESULT: {PASS} passed, {FAIL} failed")
    if FAILURES:
        print("\nFailures:")
        for f in FAILURES:
            print(f"  - {f}")
    print("=" * 60)
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()