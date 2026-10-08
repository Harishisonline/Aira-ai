"""
CPCB (Central Pollution Control Board) data fetcher.

CPCB publishes hourly air quality data for India through the CCR (Central
Control Room) API. The API requires a station-level query. We hit it on a
cron every 15 minutes for each active station in our list, parse the response
into our `readings` schema, and write to Postgres.

In v1 we ship with a static station list (30+ Maharashtra stations) and a
mocked CPCB client. The real client is gated on the CPCB-issued API key
which Harish will obtain from the CCR portal. Until then, the mock returns
realistic data based on a per-station seed + time-of-day perturbation.

This module is the ONLY place that talks to CPCB. Every other module reads
from Postgres.
"""

from __future__ import annotations

import os
import random
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import httpx


CPCB_BASE_URL = os.environ.get("CPCB_API_BASE", "https://api.cpcbccr.io/v1")  # placeholder
CPCB_API_KEY  = os.environ.get("CPCB_API_KEY", "")  # empty -> use mock
TIMEOUT_S = 10.0


def get_cpcb_api_key() -> str:
    """Read CPCB_API_KEY at call time so env changes take effect without restart."""
    return os.environ.get("CPCB_API_KEY", "")


@dataclass
class Station:
    id: str           # CPCB station id, e.g. "MUMBAI_BORIVALI"
    name: str
    state: str
    city: str
    place: str
    lat: float
    lng: float
    operator: str = "CPCB"


# --- Static station list (Maharashtra, v1) ---------------------------------

STATIONS: list[Station] = [
    Station("MUMBAI_BORIVALI",  "Borivali",      "Maharashtra", "Mumbai",    "Borivali",  19.2307, 72.8567),
    Station("MUMBAI_BANDRA",    "Bandra",        "Maharashtra", "Mumbai",    "Bandra",    19.0596, 72.8295),
    Station("MUMBAI_ANDHERI",   "Andheri",       "Maharashtra", "Mumbai",    "Andheri",   19.1136, 72.8697),
    Station("MUMBAI_COLABA",    "Colaba",        "Maharashtra", "Mumbai",    "Colaba",    18.9067, 72.8147),
    Station("MUMBAI_NAVI",      "Navi Mumbai",   "Maharashtra", "Mumbai",    "Navi Mumbai", 19.0330, 73.0297),
    Station("MUMBAI_THANE",     "Thane",         "Maharashtra", "Mumbai",    "Thane",     19.2183, 72.9781),
    Station("PUNE_KOTHRUD",     "Kothrud",       "Maharashtra", "Pune",      "Kothrud",   18.5074, 73.8077),
    Station("PUNE_SWARGATE",    "Swargate",      "Maharashtra", "Pune",      "Swargate",  18.5018, 73.8636),
    Station("NAGPUR_CIVIL",     "Civil Lines",   "Maharashtra", "Nagpur",    "Civil Lines", 21.1458, 79.0882),
    Station("NAGPUR_RAM",       "Ramdaspeth",    "Maharashtra", "Nagpur",    "Ramdaspeth",  21.1389, 79.0686),
    Station("NASHIK_GANGAPUR",  "Gangapur",      "Maharashtra", "Nashik",    "Gangapur",  19.9975, 73.7898),
    Station("AURANGABAD_CIDCO", "CIDCO",         "Maharashtra", "Aurangabad", "CIDCO",    19.8762, 75.3433),
    Station("SOLAPUR_BHAVI",    "Bhavani Peth",  "Maharashtra", "Solapur",   "Bhavani Peth", 17.6599, 75.9064),
    Station("KOLHAPUR_RANKALA","Rankala",       "Maharashtra", "Kolhapur",  "Rankala",   16.7050, 74.2433),
    Station("SANGLI_VISH",      "Vishrambaug",   "Maharashtra", "Sangli",    "Vishrambaug", 16.8524, 74.5815),
    Station("RATNAGIRI_KS",     "K.S. Wadi",     "Maharashtra", "Ratnagiri", "K.S. Wadi", 16.9944, 73.3122),
    Station("SINDHUDURG",       "Sindhudurg",    "Maharashtra", "Sindhudurg", "Sindhudurg", 16.3500, 73.7500),
    Station("AKOLA_DAS",        "Dastur Nagar",  "Maharashtra", "Akola",     "Dastur Nagar", 20.7000, 77.0000),
    Station("AMRAVATI",         "Amravati",      "Maharashtra", "Amravati",  "Amravati", 20.9333, 77.7500),
    Station("LATUR",            "Latur",         "Maharashtra", "Latur",     "Latur",    18.4000, 76.5833),
    Station("OSMANABAD",        "Osmanabad",     "Maharashtra", "Osmanabad", "Osmanabad", 18.1500, 76.0500),
    Station("PARBHANI",         "Parbhani",      "Maharashtra", "Parbhani",  "Parbhani", 19.2700, 76.7600),
    Station("JALGAON",          "Jalgaon",       "Maharashtra", "Jalgaon",   "Jalgaon",  21.0167, 75.5667),
    Station("DHULE",            "Dhule",         "Maharashtra", "Dhule",     "Dhule",    20.9000, 74.7833),
    Station("NANDURBAR",        "Nandurbar",     "Maharashtra", "Nandurbar", "Nandurbar", 21.3667, 74.2500),
    Station("WASHIM",           "Washim",        "Maharashtra", "Washim",    "Washim",   20.1110, 77.1333),
    Station("HINGOLI",          "Hingoli",       "Maharashtra", "Hingoli",   "Hingoli",  19.7200, 77.1500),
    Station("GADCHIROLI",       "Gadchiroli",    "Maharashtra", "Gadchiroli", "Gadchiroli", 20.1800, 80.0000),
    Station("CHANDRAPUR",       "Chandrapur",    "Maharashtra", "Chandrapur", "Chandrapur", 19.9500, 79.3000),
    Station("GADAG",            "Gadag",         "Maharashtra", "Gadag",     "Gadag",    15.4167, 75.6167),  # note: Gadag is actually in Karnataka, included as test case
]


def all_stations() -> list[Station]:
    return STATIONS


def find_station(place_slug: str) -> Optional[Station]:
    """Look up a station by place slug (lowercase, hyphen-separated)."""
    s = place_slug.lower().replace("-", "_")
    for st in STATIONS:
        if st.place.lower().replace(" ", "_").replace("-", "_") == s:
            return st
    return None


# --- Mock data generator (deterministic, time-aware) ------------------------

def _seed_for(station: Station) -> int:
    """Stable per-station seed from the id."""
    return sum(ord(c) for c in station.id)


def _mock_reading(station: Station) -> dict:
    """Generate a realistic mock reading for the current moment.
    Pattern: each station has a baseline that drifts up at morning/evening
    rush hours and down overnight. PM2.5 is the dominant pollutant for most
    urban Maharashtra stations.
    """
    rng = random.Random(_seed_for(station) + int(time.time()) // 900)  # changes every 15min
    hour = datetime.now(timezone.utc).hour + 5  # IST approximation
    rush_boost = 30 if hour in (8, 9, 10, 18, 19, 20) else 0
    overnight_drop = -15 if 1 <= hour <= 5 else 0
    # Per-station baseline (Mumbai higher, rural lower)
    is_mumbai = station.city == "Mumbai"
    base = {
        "pm25": 35 if is_mumbai else 25,
        "pm10": 85 if is_mumbai else 60,
        "no2":  28 if is_mumbai else 18,
        "so2":  8,
        "co":   0.7 if is_mumbai else 0.5,
        "o3":   42,
    }
    return {
        "pm25": max(0.0, base["pm25"] + rush_boost + overnight_drop + rng.uniform(-8, 12)),
        "pm10": max(0.0, base["pm10"] + rush_boost + overnight_drop + rng.uniform(-15, 25)),
        "no2":  max(0.0, base["no2"]  + rush_boost + overnight_drop + rng.uniform(-5, 10)),
        "so2":  max(0.0, base["so2"]  + rng.uniform(-2, 4)),
        "co":   max(0.0, base["co"]   + rush_boost / 20.0 + rng.uniform(-0.1, 0.2)),
        "o3":   max(0.0, base["o3"]   - overnight_drop / 2.0 + rng.uniform(-8, 10)),
    }


# --- CPCB API client --------------------------------------------------------

def _fetch_live(station: Station) -> dict:
    """Fetch live data from CPCB. Raises if API key is missing or request fails."""
    key = get_cpcb_api_key()
    if not key:
        raise RuntimeError("CPCB_API_KEY not set; cannot fetch live data")
    url = f"{CPCB_BASE_URL}/stations/{station.id}/latest"
    headers = {"X-API-Key": key, "Accept": "application/json"}
    with httpx.Client(timeout=TIMEOUT_S) as client:
        r = client.get(url, headers=headers)
        r.raise_for_status()
        data = r.json()
    # Map CPCB response field names to our schema (adjust as needed when real API is wired)
    return {
        "pm25": float(data.get("pm25", data.get("PM2_5", 0))),
        "pm10": float(data.get("pm10", data.get("PM10", 0))),
        "no2":  float(data.get("no2",  data.get("NO2", 0))),
        "so2":  float(data.get("so2",  data.get("SO2", 0))),
        "co":   float(data.get("co",   data.get("CO", 0))),
        "o3":   float(data.get("o3",   data.get("OZONE", data.get("O3", 0)))),
    }


def fetch_reading(station: Station) -> tuple[dict, bool]:
    """Fetch the latest reading for a station. Returns (reading_dict, is_live).
    If CPCB_API_KEY is not set, returns a mock reading with is_live=False.
    """
    if get_cpcb_api_key():
        try:
            return _fetch_live(station), True
        except Exception as e:
            # Don't fail the whole ingest if one station is down; log and fall back
            print(f"[cpcb] live fetch failed for {station.id}: {e}; using mock")
    return _mock_reading(station), False


# --- CLI test ----------------------------------------------------------------

if __name__ == "__main__":
    s = find_station("borivali")
    assert s is not None
    reading, live = fetch_reading(s)
    print(f"{s.id}: live={live}")
    for k, v in reading.items():
        print(f"  {k}: {v:.1f}")
