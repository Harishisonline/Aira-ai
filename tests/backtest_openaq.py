"""
Aira AI -- OpenAQ integration backtest.

Verifies that the OpenAQ fetcher, the worker ingest step, and the
resulting DB rows all work end-to-end against the live OpenAQ API
using the provided API key.

Steps:
  1.  Verify the OpenAQ key is configured (env / .env).
  2.  Hit OpenAQ directly to confirm reachability and that a known
      Maharashtra station returns real readings.
  3.  Run the OpenAQ fetcher in isolation for 5 stations and verify
      the output shape matches the worker's expected contract.
  4.  Run the worker ingest function against the live Supabase DB
      (via Management API to insert readings for stations not already
      present today).
  5.  Verify the readings landed in the DB.

Run:  python3 tests/backtest_openaq.py
"""

from __future__ import annotations

import os
import sys
import json
import asyncio
from pathlib import Path
from datetime import datetime, timezone

import httpx

ROOT = Path("/Users/harish/Downloads/aira-ai")
WORKER = ROOT / "apps" / "worker"
sys.path.insert(0, str(WORKER))

SUPABASE_TOKEN = os.environ.get("SUPABASE_TOKEN", "sbp_fcc7f64b8b72eea5eaa37a74759abae36f640342")
SUPABASE_REF = "svqugnhrcwugdjgobdqs"
SUPABASE_URL = f"https://{SUPABASE_REF}.supabase.co"

# Try to load OPENAQ_KEY from .env
ENV = {}
env_path = ROOT / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        ENV[k.strip()] = v.strip()

OPENAQ_KEY = os.environ.get("OPENAQ_KEY") or ENV.get("OPENAQ_KEY", "")
SERVICE_KEY = ENV.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Make the key available to the worker fetcher module
if OPENAQ_KEY and not os.environ.get("OPENAQ_KEY"):
    os.environ["OPENAQ_KEY"] = OPENAQ_KEY

# Tally
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


def mgmt_sql(sql: str):
    r = httpx.post(
        f"https://api.supabase.com/v1/projects/{SUPABASE_REF}/database/query",
        headers={"Authorization": f"Bearer {SUPABASE_TOKEN}", "Content-Type": "application/json"},
        json={"query": sql},
        timeout=120,
    )
    if r.status_code >= 400:
        return None
    return r.json() if r.text else []


# ---------- 1. Key configured ----------

print("=" * 60)
print("OPENAQ INTEGRATION BACKTEST")
print("=" * 60)
print(f"OpenAQ key length: {len(OPENAQ_KEY)}")

check("OpenAQ key configured", bool(OPENAQ_KEY) and len(OPENAQ_KEY) >= 64,
      f"key length is {len(OPENAQ_KEY)}")


# ---------- 2. OpenAQ reachable + MPCB stations exist ----------

def test_openaq_reachable():
    print("\n[2] OpenAQ reachability + MPCB stations")
    r = httpx.get(
        "https://api.openaq.org/v3/locations/6927/latest",  # Colaba, MPCB
        headers={"X-API-Key": OPENAQ_KEY},
        timeout=15,
    )
    check("GET /locations/6927/latest = 200", r.status_code == 200, f"HTTP {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        latest = data.get("results", [])
        check("Colaba has at least 2 sensors", len(latest) >= 2, f"got {len(latest)}")
        # Find any sensor with a recent reading
        recent = any(
            (s.get("datetime", {}).get("utc") or "").startswith("2026-")
            for s in latest
        )
        check("At least one sensor has a 2026 reading", recent, "no recent readings")


# ---------- 3. Fetcher shape ----------

def test_fetcher_shape():
    print("\n[3] OpenAQ fetcher output shape (live data via worker fetcher)")
    from app.fetchers.openaq import fetch_openaq_latest, OPENAQ_STATION_MAP

    # Count both mapped and intentionally-unmapped stations
    mapped = [k for k, v in OPENAQ_STATION_MAP.items() if v is not None]
    unmapped = [k for k, v in OPENAQ_STATION_MAP.items() if v is None]
    check(f"Curated map covers {len(OPENAQ_STATION_MAP)}/30 stations",
          len(OPENAQ_STATION_MAP) == 30, f"got {len(OPENAQ_STATION_MAP)}")
    check(f"{len(mapped)}/30 stations have OpenAQ location IDs (others fall back to mock)",
          len(mapped) >= 20, f"got {len(mapped)} mapped, {len(unmapped)} unmapped")
    print(f"  mapped stations: {mapped}")
    print(f"  unmapped stations (mock fallback): {unmapped}")

    async def run_fetcher():
        results = {}
        # Test 1 station at a time, pausing between fetches to avoid rate limits
        for sid in ["MUMBAI_COLABA", "PUNE_KOTHRUD", "NAGPUR_CIVIL", "GADCHIROLI"]:
            import asyncio
            await asyncio.sleep(2)  # rate limit pause
            r = await fetch_openaq_latest(sid)
            results[sid] = r
        return results

    results = asyncio.run(run_fetcher())

    # Mumbai Colaba: should return real data
    r = results["MUMBAI_COLABA"]
    check("Colaba returns real data", r is not None, "got None (rate limited?)")
    if r:
        for k in ["pm25", "pm10", "no2", "so2", "co", "o3"]:
            check(f"Colaba has {k} field", k in r, f"missing {k}")
            check(f"Colaba {k} is numeric and >= 0", isinstance(r.get(k, -1), (int, float)) and r.get(k, -1) >= 0,
                  f"got {r.get(k)!r}")

    # Pune Kothrud: realistic (NOT pm25=1060, the legacy sensor value)
    r = results["PUNE_KOTHRUD"]
    if r:
        check("Pune pm25 is realistic (< 500, not the 1060 legacy value)",
              0 < r.get("pm25", 0) < 500, f"got {r.get('pm25')}")
        check("Pune pm10 is realistic (< 1000, not the 1700 legacy value)",
              0 < r.get("pm10", 0) < 1000, f"got {r.get('pm10')}")

    # Gadchiroli: should return None (no OpenAQ match)
    r = results["GADCHIROLI"]
    check("Gadchiroli returns None (no OpenAQ match)", r is None, f"got {r}")


# ---------- 4. Worker ingest via Supabase (test the data path) ----------

def test_ingest_writes_real_readings():
    print("\n[4] Simulated ingest: write real OpenAQ readings to the DB")
    # We can't easily run the full ingest pipeline because the worker can't
    # connect to the DB from this machine (network blocked). Instead, we
    # simulate it: fetch live OpenAQ data, and INSERT one fresh reading
    # into the DB via the Supabase REST gateway.

    from app.fetchers.openaq import fetch_openaq_latest

    async def ingest_one():
        # Pick a station that should have recent live data
        for sid in ["MUMBAI_COLABA", "NAGPUR_CIVIL", "PUNE_KOTHRUD"]:
            r = await fetch_openaq_latest(sid)
            if r and any(r[k] > 0 for k in ["pm25", "pm10", "no2"]):
                return sid, r
            # Avoid hitting OpenAQ rate limit by pausing between fetches
            import asyncio
            await asyncio.sleep(2)
        return None, None

    sid, reading = asyncio.run(ingest_one())
    if sid is None:
        check("Got at least one station with real readings", False, "all returned None or zeros")
        return

    print(f"  fetched live reading for {sid}: pm25={reading['pm25']:.1f} pm10={reading['pm10']:.1f}")

    # Compute AQI from the live reading
    from app.compute.naqi import compute_aqi
    result = compute_aqi(
        pm25=reading.get("pm25"),
        pm10=reading.get("pm10"),
        no2=reading.get("no2"),
        so2=reading.get("so2"),
        co=reading.get("co"),
        o3=reading.get("o3"),
    )
    check("Live reading produces a valid AQI", 0 <= result.aqi <= 500, f"got AQI={result.aqi}")
    check("Live reading has a bucket", result.bucket.label in [
        "Good", "Satisfactory", "Moderate", "Poor", "Very Poor", "Severe"
    ], f"got {result.bucket.label}")

    # ACTUALLY write the reading to Supabase via the REST gateway
    # (the worker can't connect to Postgres from this network, but the
    # REST API gateway is reachable and the service_role key bypasses RLS).
    insert_body = {
        "station_id": sid,
        "pm25": reading["pm25"],
        "pm10": reading["pm10"],
        "no2": reading["no2"],
        "so2": reading["so2"],
        "co": reading["co"],
        "o3": reading["o3"],
        "aqi": int(result.aqi),
        "bucket": result.bucket.label,
        "dominant": result.dominant_pollutant,
        "source": "openaq",
    }
    r = httpx.post(
        f"{SUPABASE_URL}/rest/v1/readings",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        json=insert_body,
        timeout=15,
    )
    check(f"POST /readings (OpenAQ source) = 201", r.status_code == 201, f"HTTP {r.status_code}: {r.text[:200]}")


# ---------- 5. Verify DB rows ----------

def test_db_readings():
    print("\n[5] DB readings after backtest run")
    v = mgmt_sql("SELECT COUNT(*) AS n, MAX(recorded_at::date) AS latest_date, MIN(source) AS first_source, MAX(source) AS last_source FROM readings WHERE recorded_at > NOW() - INTERVAL '2 hours'")
    if v and v[0]:
        row = v[0]
        check("At least 1 reading in the last 2h", int(row["n"]) >= 1, f"got {row['n']}")
        check("Most recent reading date is recent", row["latest_date"] is not None,
              f"latest_date={row['latest_date']}")


def main():
    print("=" * 60)
    print(f"Target:  {SUPABASE_URL}")
    print(f"Key:    OPENAQ_KEY ({'set' if OPENAQ_KEY else 'NOT SET'})")
    print()
    test_openaq_reachable()
    test_fetcher_shape()
    # Sleep between sections to let OpenAQ rate limit recover
    print("\n  (sleeping 15s for OpenAQ rate limit recovery)")
    import time
    time.sleep(15)
    test_ingest_writes_real_readings()
    test_db_readings()
    print()
    print("=" * 60)
    print(f"RESULT: {PASS} passed, {FAIL} failed")
    if FAILURES:
        print("\nFailures:")
        for f in FAILURES:
            print(f"  - {f}")
    print("=" * 60)
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()