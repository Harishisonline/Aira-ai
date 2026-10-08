"""
OpenAQ fetcher -- the free, real-world AQI data source we use instead of
CPCB's gated API.

OpenAQ (https://openaq.org) is an open-source aggregator that pulls air
quality readings from government stations worldwide, including India's
CPCB (Maharashtra Pollution Control Board -- owner="Maharashtra Pollution
Control Board" or "MPCB").

Endpoint: GET https://api.openaq.org/v3/locations/{id}/sensors
Lookup:  GET https://api.openaq.org/v3/sensors/{id}

For v3 auth, pass the API key in the `X-API-Key` header. The API key is
optional (rate-limited without one), but recommended. Get one at
https://openaq.org/login.

For each of our 30 Maharashtra stations we cached the nearest OpenAQ
location id below (curated from the live API on 2026-10-08). Stations
without a match (remote CPCB outposts that OpenAQ hasn't indexed yet)
fall back to the deterministic mock fetcher in cpcb.py.

UNIT CONVERSIONS: OpenAQ reports gases (NO2, SO2, O3) in ppb; PM2.5,
PM10 in ug/m3; CO in mg/m3. The Aira schema stores everything in
ug/m3 except CO (mg/m3). Conversions:
  ppb -> ug/m3 at 25C, 1 atm:
    NO2: ppb * 1.88 = ug/m3
    SO2: ppb * 2.62 = ug/m3
    O3:  ppb * 2.00 = ug/m3

IMPORTANT: Some stations have BOTH legacy (older, stale values) and modern
sensors with the same parameter id. We pick the sensor with the most
recent datetimeLast per parameter to avoid using year-old readings.
"""

from __future__ import annotations

import os
import time
import logging
from typing import Optional

import httpx


OPENAQ_API_URL = "https://api.openaq.org/v3"
TIMEOUT_S = 10.0
log = logging.getLogger("aira.openaq")

# Unit conversion factors (ppb -> ug/m3 at standard conditions)
PPB_TO_UGM3 = {
    "no2": 1.88,
    "so2": 2.62,
    "o3":  2.00,
    "no":  1.25,
    "nox": 1.88,
}


def _api_key() -> Optional[str]:
    return os.environ.get("OPENAQ_KEY") or None


def is_openaq_enabled() -> bool:
    return bool(_api_key())


# Curated OpenAQ location IDs for Maharashtra stations.
# Keyed by our internal station_id. Source: live lookup on 2026-10-08
# (api.openaq.org/v3/locations?coordinates=lat,lng&radius=25000).
# 24 of 30 stations have an OpenAQ match. The 6 unmapped entries
# (GADCHIROLI, NANDURBAR, OSMANABAD, RATNAGIRI_KS, SINDHUDURG, WASHIM)
# fall back to the deterministic mock fetcher in cpcb.py.
OPENAQ_STATION_MAP: dict[str, Optional[int]] = {
    "AKOLA_DAS":       3409456,  # Ramdaspeth, Akola - MPCB
    "AMRAVATI":        3409459,  # Shri Shivaji Science College, Amravati - MPCB
    "AURANGABAD_CIDCO":3409461,  # Rachnakar Colony, Aurangabad - MPCB
    "CHANDRAPUR":      3409317,  # Chauhan Colony, Chandrapur - MPCB
    "DHULE":           3409473,  # Deopur, Dhule - MPCB
    "GADAG":           44515,    # Panchal Nagar, Gadag - KSPCB
    "GADCHIROLI":      None,     # No OpenAQ station within 25 km
    "HINGOLI":         6266793,  # Ashta Vinayak Nagar, Hingoli
    "JALGAON":         3409462,  # Prabhat Colony, Jalgaon - MPCB
    "KOLHAPUR_RANKALA":3409440,  # Shivaji University, Kolhapur - MPCB
    "LATUR":           3409452,  # Sawe Wadi, Latur - MPCB
    "MUMBAI_ANDHERI":  5593,     # Pimpleshwar Mandir, Thane - MPCB
    "MUMBAI_BANDRA":   6927,     # Colaba, Mumbai - MPCB (nearest active)
    "MUMBAI_BORIVALI": 5593,     # Pimpleshwar Mandir, Thane - MPCB (closest)
    "MUMBAI_COLABA":   6927,     # Colaba, Mumbai - MPCB
    "MUMBAI_NAVI":     6943,     # Mahape, Navi Mumbai - MPCB
    "MUMBAI_THANE":    5593,     # Pimpleshwar Mandir, Thane - MPCB
    "NAGPUR_CIVIL":    5621,     # Opp GPO Civil Lines, Nagpur - MPCB
    "NAGPUR_RAM":      5621,     # Opp GPO Civil Lines, Nagpur - MPCB
    "NANDURBAR":       None,     # No OpenAQ station within 25 km
    "NASHIK_GANGAPUR": 5592,     # Gangapur Road, Nashik - MPCB
    "OSMANABAD":       None,     # No OpenAQ station within 25 km
    "PARBHANI":        3409466,  # Masoom Colony, Parbhani - MPCB
    "PUNE_KOTHRUD":    5661,     # Karve Road Pune, Pune - MPCB
    "PUNE_SWARGATE":   5661,     # Karve Road Pune, Pune - MPCB
    "RATNAGIRI_KS":    None,     # No OpenAQ station within 25 km
    "SANGLI_VISH":     3409446,  # Vijay Nagar, Sangli - MPCB
    "SINDHUDURG":      None,     # No OpenAQ station within 25 km
    "SOLAPUR_BHAVI":   2596,     # Solapur, Solapur - MPCB
    "WASHIM":          None,     # No OpenAQ station within 25 km
}


def get_openaq_location_id(station_id: str) -> Optional[int]:
    return OPENAQ_STATION_MAP.get(station_id)


def _convert_value(param: str, value: float, units: str) -> float:
    """Convert OpenAQ reading to our schema units."""
    if param == "co":
        # CO is mg/m3 in both OpenAQ and our schema
        return float(value)
    if param in ("pm25", "pm10"):
        return float(value)
    if units.lower() == "ppb" and param in PPB_TO_UGM3:
        return float(value) * PPB_TO_UGM3[param]
    return float(value)


def _resolve_param_name(param: dict) -> str:
    """Normalize OpenAQ's parameter name to one of our 6 keys."""
    name = (param.get("name") or param.get("id") or "").lower()
    if name in ("pm25", "pm10", "no2", "so2", "co", "o3"):
        return name
    dname = (param.get("displayName") or "").lower()
    if dname == "pm2.5": return "pm25"
    if dname == "pm10": return "pm10"
    if dname == "no2" or dname == "no₂": return "no2"
    if dname == "so2" or dname == "so₂": return "so2"
    if dname == "o3" or dname == "o₃": return "o3"
    if dname == "co": return "co"
    return ""


async def fetch_openaq_latest(station_id: str) -> Optional[dict]:
    """Fetch latest readings for a Maharashtra station from OpenAQ."""
    api_key = _api_key()
    if not api_key:
        return None

    location_id = get_openaq_location_id(station_id)
    if location_id is None:
        return None

    headers = {"X-API-Key": api_key, "Accept": "application/json"}
    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        try:
            # Step 1: list sensors at this location
            r = await client.get(
                f"{OPENAQ_API_URL}/locations/{location_id}/sensors",
                headers=headers,
            )
            r.raise_for_status()
            sensors_list = r.json().get("results", [])
            if not sensors_list:
                log.info(f"openaq: no sensors at {station_id} (loc {location_id})")
                return None

            # Step 2: fetch each sensor in parallel for parameter + latest value
            sensor_meta: dict[int, dict] = {}
            for s in sensors_list:
                sid = s.get("id")
                if not sid:
                    continue
                try:
                    sr = await client.get(f"{OPENAQ_API_URL}/sensors/{sid}", headers=headers)
                    sr.raise_for_status()
                    res = sr.json().get("results", [])
                    if res:
                        sensor_meta[sid] = res[0]
                except Exception as e:
                    log.debug(f"openaq: sensor {sid} lookup failed: {e}")

            # For each of our 6 parameters, pick the sensor whose datetimeLast is most recent
            param_to_sensor: dict[str, int] = {}
            for sid, m in sensor_meta.items():
                pname = _resolve_param_name(m.get("parameter", {}))
                if not pname:
                    continue
                ts = (m.get("datetimeLast") or {}).get("utc") or ""
                cur_sid = param_to_sensor.get(pname)
                if cur_sid is None:
                    param_to_sensor[pname] = sid
                else:
                    cur_ts = (sensor_meta.get(cur_sid, {}).get("datetimeLast") or {}).get("utc") or ""
                    if ts > cur_ts:
                        param_to_sensor[pname] = sid

            if not param_to_sensor:
                log.warning(f"openaq {station_id}: no parameters resolved from {len(sensors_list)} sensors")
                return None

            # Build output from the preferred sensor's `latest.value`
            out: dict[str, float] = {"pm25": 0.0, "pm10": 0.0, "no2": 0.0, "so2": 0.0, "co": 0.0, "o3": 0.0}
            recorded_at = None
            for pname, sid in param_to_sensor.items():
                m = sensor_meta.get(sid, {})
                latest = m.get("latest") or {}
                value = latest.get("value")
                if value is None:
                    continue
                param = m.get("parameter", {})
                out[pname] = _convert_value(pname, value, param.get("units", ""))
                ts = (latest.get("datetime") or {}).get("utc") or (latest.get("datetime") or {}).get("local")
                if ts and (recorded_at is None or ts > recorded_at):
                    recorded_at = ts

            return {
                **out,
                "_source": "openaq",
                "_recorded_at": recorded_at,
                "_openqa_location_id": location_id,
            }
        except Exception as e:
            log.warning(f"openaq fetch failed for {station_id}: {e}")
            return None


def fetch_openaq_latest_sync(station_id: str) -> Optional[dict]:
    """Synchronous wrapper around fetch_openaq_latest."""
    import asyncio
    return asyncio.run(fetch_openaq_latest(station_id))


# In-memory cache so we don't re-fetch the same station on every request.
# TTL = 5 minutes. Cleared on process restart.
_CACHE: dict[str, tuple[float, Optional[dict]]] = {}
_CACHE_TTL_S = 300


async def fetch_openaq_latest_cached_async(station_id: str) -> Optional[dict]:
    """Async cache wrapper around fetch_openaq_latest. 5-min TTL."""
    now = time.time()
    if station_id in _CACHE:
        ts, val = _CACHE[station_id]
        if now - ts < _CACHE_TTL_S:
            return val
    val = await fetch_openaq_latest(station_id)
    _CACHE[station_id] = (now, val)
    return val


def fetch_openaq_latest_cached(station_id: str) -> Optional[dict]:
    """Sync wrapper for use from non-async contexts. Creates its own event loop."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop is None:
        return asyncio.run(fetch_openaq_latest(station_id))
    # If we're already inside an event loop, we can't call asyncio.run.
    # Fall back to direct call (caller is responsible for awaiting).
    raise RuntimeError(
        "fetch_openaq_latest_cached() called from a running event loop. "
        "Use await fetch_openaq_latest_cached_async() instead."
    )