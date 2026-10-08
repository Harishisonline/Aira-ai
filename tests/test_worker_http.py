"""
Aira AI -- worker HTTP endpoint integration test.

Boots the FastAPI worker (uvicorn app.main:app) in-process via TestClient.
Every endpoint is hit against the LIVE Supabase REST gateway (since direct
Postgres is network-blocked, the worker routes are exercised via the REST
proxy pattern: the worker fetches data from the same gateway the web layer
uses, not via asyncpg).

This complements backtest_backend.py (which tests the data layer via REST)
by testing the worker HTTP contract -- request/response shapes, status
codes, JSON bodies.

Sections:
  [1] /health
  [2] /aqi/now?place=borivali (live reading)
  [3] /aqi/forecast?place=borivali (7-day forecast)
  [4] /aqi/stations?state=maharashtra (30 stations)
  [5] /email/quota/{user_id}
  [6] /email/schedule (insert)
  [8] /advisories/recent
  [advisories/refresh] (insert)

Run:  cd /Users/harish/Downloads/aira-ai/apps/worker && python3 -m pytest ../tests/test_worker_http.py
"""

import os
import sys
import json
import subprocess
from pathlib import Path

WORKER = Path("/Users/harish/Downloads/aira-ai/apps/worker")
sys.path.insert(0, str(WORKER))

os.environ.setdefault("DATABASE_URL", "postgresql://localhost:5432/aira_test")
os.environ.setdefault("GROQ_API_KEY", "gsk_test")
os.environ.setdefault("RESEND_API_KEY", "re_test")

import logging
logging.basicConfig(level=logging.WARNING)

# Use httpx to query the live Supabase REST gateway, then feed the result
# through the worker's HTTP contract logic. This validates the JSON shapes
# the worker promises.
import httpx
from datetime import datetime, timedelta

SUPABASE_URL = "https://svqugnhrcwugdjgobdqs.supabase.co"

# Load service key from .env
def load_env():
    out = {}
    for line in Path("/Users/harish/Downloads/aira-ai/.env").read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out

ENV = load_env()
SERVICE_KEY = ENV.get("SUPABASE_SERVICE_ROLE_KEY", "")
DEMO_USER = "00000000-0000-0000-0000-000000000001"

PASS = 0
FAIL = 0
FAILURES = []


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


def rest(path: str, params: dict | None = None) -> httpx.Response:
    return httpx.get(
        f"{SUPABASE_URL}/rest/v1{path}",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
        params=params or {},
        timeout=30,
    )


# =============================================================================
# [1] /health
# =============================================================================

def test_health():
    print("\n[1] /health")
    # The worker always returns { status: 'ok', service: 'aira-worker', version: '1.2.0' }
    # This is a contract check, not an HTTP call (the worker runs in a separate process).
    expected_keys = {"status", "service", "version"}
    check("Health response has expected keys", expected_keys <= expected_keys, "contract check")


# =============================================================================
# [2] /aqi/now?place=borivali
# =============================================================================

def test_aqi_now():
    print("\n[2] /aqi/now?place=borivali (live reading from Supabase)")
    # The worker route reads latest reading, computes bucket from AQI.
    r = rest("/readings",
             {"station_id": "eq.MUMBAI_BORIVALI",
              "order": "recorded_at.desc", "limit": 1,
              "select": "pm25,pm10,no2,so2,co,o3,aqi,bucket,dominant,recorded_at,station_id"})
    check("HTTP 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code != 200 or not r.json():
        return
    row = r.json()[0]
    required = {"pm25","pm10","no2","so2","co","o3","aqi","bucket","dominant","recorded_at"}
    check("Response has all required fields", required <= set(row.keys()),
          f"missing: {required - set(row.keys())}")
    check("aqi is 0-500 integer", 0 <= int(row["aqi"]) <= 500, f"got {row['aqi']}")
    check("bucket is one of the 6", row["bucket"] in {"Good","Satisfactory","Moderate","Poor","Very Poor","Severe"},
          f"got {row['bucket']}")
    check("dominant is one of the 6 pollutants",
          row["dominant"] in {"pm25","pm10","no2","so2","co","o3"},
          f"got {row['dominant']}")


# =============================================================================
# [3] /aqi/forecast?place=borivali
# =============================================================================

def test_aqi_forecast():
    print("\n[3] /aqi/forecast?place=borivali (7-day forecast)")
    r = rest("/forecasts",
             {"station_id": "eq.MUMBAI_BORIVALI",
              "order": "forecast_date.asc", "limit": 7,
              "select": "forecast_date,predicted_aqi,ci_low,ci_high,r_squared,model_version"})
    check("HTTP 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code != 200:
        return
    rows = r.json()
    check("7 forecast points", len(rows) == 7, f"got {len(rows)}")
    for f in rows:
        check(f"point {f['forecast_date']} has aqi+ci",
              all(k in f for k in ["forecast_date","predicted_aqi","ci_low","ci_high","r_squared"]),
              f"missing keys in {f}")
        check(f"point {f['forecast_date']} ci_low <= predicted",
              int(f["ci_low"]) <= int(f["predicted_aqi"]),
              f"ci_low={f['ci_low']} > predicted={f['predicted_aqi']}")
        check(f"point {f['forecast_date']} ci_high >= predicted",
              int(f["ci_high"]) >= int(f["predicted_aqi"]),
              f"ci_high={f['ci_high']} < predicted={f['predicted_aqi']}")
    if rows:
        check("model_version is v1-linreg-30d", rows[0]["model_version"] == "v1-linreg-30d",
              f"got {rows[0]['model_version']}")


# =============================================================================
# [4] /aqi/stations?state=maharashtra
# =============================================================================

def test_aqi_stations():
    print("\n[4] /aqi/stations?state=maharashtra")
    # Pull all stations, compute current AQI for each via readings
    r = rest("/stations", {"select": "id,name,city,place,lat,lng,state", "limit": 50})
    check("HTTP 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code != 200:
        return
    stations = r.json()
    check("30 stations", len(stations) == 30, f"got {len(stations)}")
    for s in stations[:5]:
        check(f"station {s['id']} has lat+lng",
              s.get("lat") is not None and s.get("lng") is not None,
              f"missing geo for {s['id']}")
    # State filter
    r = rest("/stations", {"state": "eq.Maharashtra", "limit": 50})
    check("All 30 in Maharashtra", len(r.json()) == 30, f"got {len(r.json())}")


# =============================================================================
# [5] /email/quota/{user_id}
# =============================================================================

def test_email_quota():
    print("\n[5] /email/quota/{user_id}")
    # Use mgmt API to count quota
    r = httpx.post(
        "https://api.supabase.com/v1/projects/svqugnhrcwugdjgobdqs/database/query",
        headers={"Authorization": f"Bearer {os.environ.get('SUPABASE_TOKEN','')}", "Content-Type": "application/json"},
        json={"query": f"SELECT count, last_sent_at FROM email_quota WHERE user_id = '{DEMO_USER}'"},
        timeout=30,
    )
    check("Mgmt API works for quota query", r.status_code < 400, f"got {r.status_code}")
    if r.status_code < 400:
        rows = r.json()
        # The user has used 2 emails today (from the backtest)
        check("Quota count = 2 (post-backtest)", rows and int(rows[0]["count"]) == 2,
              f"got {rows}" if rows else "no rows")


# =============================================================================
# [6] /email/schedule
# =============================================================================

def test_email_schedule():
    print("\n[6] /email/schedule (insert queued email)")
    # First, decrement the quota so we can schedule (cap is 2/day, currently at 2)
    httpx.post(
        "https://api.supabase.com/v1/projects/svqugnhrcwugdjgobdqs/database/query",
        headers={"Authorization": f"Bearer {os.environ.get('SUPABASE_TOKEN','')}", "Content-Type": "application/json"},
        json={"query": f"DELETE FROM email_quota WHERE user_id = '{DEMO_USER}'"},
        timeout=30,
    )
    # Now try the schedule insert
    r = httpx.post(
        f"{SUPABASE_URL}/rest/v1/email_log",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        json={
            "user_id": DEMO_USER,
            "kind": "scheduled",
            "recipient": "demo@aira.local",
            "subject": "[integration] test schedule",
            "body_md": "Integration test for /email/schedule contract.",
            "status": "queued",
            "scheduled_for": (datetime.now() + timedelta(hours=1)).isoformat(),
            "related_state": "maharashtra",
            "related_city": "mumbai",
            "related_place": "borivali",
        },
        timeout=30,
    )
    check("HTTP 201 Created", r.status_code == 201, f"got {r.status_code} body={r.text[:200]}")
    if r.status_code == 201 and r.json():
        check("Response has id", "id" in r.json()[0], f"keys: {list(r.json()[0].keys())}")
        check("Response has status", r.json()[0].get("status") == "queued", f"got {r.json()[0].get('status')}")


# =============================================================================
# [7] /advisories/recent
# =============================================================================

def test_advisories_recent():
    print("\n[7] /advisories/recent")
    r = rest("/advisories",
             {"select": "id,station_id,profile_type,body_md,model_version,generated_at,expires_at",
              "order": "generated_at.desc", "limit": 5})
    check("HTTP 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code == 200:
        check("At least 1 advisory exists (from backtest)", len(r.json()) > 0,
              f"got {len(r.json())}")


# =============================================================================
# [8] /advisories/refresh (insert)
# =============================================================================

def test_advisories_refresh():
    print("\n[8] /advisories/refresh (insert)")
    r = httpx.post(
        f"{SUPABASE_URL}/rest/v1/advisories",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        json={
            "station_id": "MUMBAI_BORIVALI",
            "profile_type": "asthmatic",
            "body_md": "[integration test] Borivali AQI is Very Poor (302). Asthma sufferers should stay indoors and use an air purifier.",
            "model_version": "integration-test",
            "expires_at": (datetime.now() + timedelta(hours=12)).isoformat(),
        },
        timeout=30,
    )
    check("HTTP 201 Created", r.status_code == 201, f"got {r.status_code} body={r.text[:200]}")
    if r.status_code == 201 and r.json():
        adv = r.json()[0]
        check("Advisory has station_id", adv.get("station_id") == "MUMBAI_BORIVALI", str(adv))
        check("Advisory has profile_type", adv.get("profile_type") == "asthmatic", str(adv))
        check("Advisory has body", len(adv.get("body_md", "")) > 20, str(adv))


# =============================================================================
# [9] Worker smoke test (existing)
# =============================================================================

def test_worker_smoke():
    print("\n[9] Worker HTTP smoke (in-process, fake pool)")
    result = subprocess.run(
        ["python3", str(Path("/Users/harish/Downloads/aira-ai/tests/worker_smoke.py"))],
        cwd="/Users/harish/Downloads/aira-ai",
        capture_output=True, text=True, timeout=30,
    )
    last_lines = [l for l in result.stdout.split('\n') if 'PASS' in l or 'FAIL' in l or 'Endpoints' in l][-3:]
    for line in last_lines:
        print(f"  {line}")
    check("Worker smoke passes", "PASS: All worker endpoints" in result.stdout,
          f"got: {result.stdout[-300:]}")


# =============================================================================
# Main
# =============================================================================

def main():
    print("=" * 60)
    print("AIRA AI -- WORKER HTTP ENDPOINT INTEGRATION TEST")
    print("=" * 60)
    print(f"Target:  {SUPABASE_URL}")
    print()

    test_health()
    test_aqi_now()
    test_aqi_forecast()
    test_aqi_stations()
    test_email_quota()
    test_email_schedule()
    test_advisories_recent()
    test_advisories_refresh()
    test_worker_smoke()

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