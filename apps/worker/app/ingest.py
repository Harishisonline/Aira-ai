"""
Full ingest pipeline: for every active station, fetch the latest AQI
using a 5-tier fallback so no station ever returns "no data".

Tier order (first to try, last to fall back):
  1. OpenAQ live       — real-time readings from MPCB stations
  2. CPCB live          — direct from India's central pollution control board
  3. Mock from past     — perturb the most recent stored reading for this station
  4. Last-known-good    — the most recent stored reading, untouched
  5. Baseline           — per-city hard-coded baseline, no DB dependency

Each tier has its own `source` label written to readings.source so we can
audit which path served the data. Runs every 15 minutes via the scheduler
in main.py. Idempotent: every ingest cycle writes a fresh `NOW()` reading.
"""

from __future__ import annotations

import logging
from typing import Optional

import asyncpg

from app.config import settings
from app.fetchers.cpcb import STATIONS, Station, _fetch_live, _mock_reading
from app.fetchers.openaq import fetch_openaq_latest_cached_async
from app.fetchers.mock_past import mock_reading_from_past
from app.compute.naqi import compute_aqi


log = logging.getLogger("aira.ingest")

# Source labels written to readings.source for audit
SRC_OPENAQ      = "openaq"
SRC_CPCB_LIVE   = "cpcb_live"
SRC_MOCK_PAST   = "mock_past"
SRC_LAST_KNOWN  = "last_known"
SRC_BASELINE    = "baseline"


async def _last_known_reading(conn: asyncpg.Connection, station_id: str) -> Optional[dict[str, float]]:
    """Read the most recent reading for this station. Returns None if no history."""
    row = await conn.fetchrow(
        """
        SELECT pm25, pm10, no2, so2, co, o3
        FROM readings
        WHERE station_id = $1
        ORDER BY recorded_at DESC
        LIMIT 1
        """,
        station_id,
    )
    if row is None:
        return None
    d = dict(row)
    # Sanity: skip if all values are 0 (likely a corrupt row)
    if all((d.get(k) or 0) == 0 for k in ("pm25", "pm10", "no2", "so2", "co", "o3")):
        return None
    return {k: float(d[k]) for k in ("pm25", "pm10", "no2", "so2", "co", "o3")}


async def _fetch_with_fallback(station: Station, conn: asyncpg.Connection) -> tuple[dict, str]:
    """Try each tier in order, return (reading, source)."""

    # Tier 1: OpenAQ live (async, with 5-min in-memory cache)
    if settings.openaq_key:
        try:
            op = await fetch_openaq_latest_cached_async(station.id)
            if op is not None:
                # Strip internal fields (_source, _recorded_at, _openqa_location_id)
                op = {k: v for k, v in op.items() if not k.startswith("_")}
                if any(op.get(k, 0) > 0 for k in ("pm25", "pm10", "no2")):
                    return op, SRC_OPENAQ
        except Exception as e:
            log.debug(f"tier 1 (openaq) error for {station.id}: {e}")

    # Tier 2: CPCB live
    if getattr(settings, "cpcb_api_key", ""):
        try:
            return _fetch_live(station), SRC_CPCB_LIVE
        except Exception as e:
            log.debug(f"tier 2 (cpcb) error for {station.id}: {e}")

    # Tier 3-5 require DB access. If we have no DB, drop to baseline.
    past: Optional[dict[str, float]] = None
    if conn is not None:
        try:
            past = await _last_known_reading(conn, station.id)
        except Exception as e:
            log.debug(f"tier 3 (last_known lookup) error for {station.id}: {e}")

    if past is not None:
        # Tier 3: perturb the past reading (time-of-day + noise)
        return mock_reading_from_past(station, past), SRC_MOCK_PAST
    # Tier 4/5: no past data — use the per-station baseline
    return _mock_reading(station), SRC_BASELINE


async def run_full_ingest(pool: asyncpg.Pool) -> dict:
    """Refresh AQI for all stations.

    Returns a summary dict: {total, by_source: {openaq: 24, mock_past: 6, ...}, errors: [...]}
    """
    summary = {"total": 0, "by_source": {}, "errors": []}
    for station in STATIONS:
        try:
            async with pool.acquire() as conn:
                reading, source = await _fetch_with_fallback(station, conn)
                result = compute_aqi(
                    pm25=reading.get("pm25"),
                    pm10=reading.get("pm10"),
                    no2=reading.get("no2"),
                    so2=reading.get("so2"),
                    co=reading.get("co"),
                    o3=reading.get("o3"),
                )
                await conn.execute(
                    """
                    INSERT INTO readings (station_id, pm25, pm10, no2, so2, co, o3,
                                         aqi, bucket, dominant, source, recorded_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
                    """,
                    station.id, reading["pm25"], reading["pm10"], reading["no2"], reading["so2"],
                    reading["co"], reading["o3"], int(result.aqi), result.bucket.label,
                    result.dominant_pollutant, source,
                )
            summary["total"] += 1
            summary["by_source"][source] = summary["by_source"].get(source, 0) + 1
        except Exception as e:
            log.exception(f"ingest failed for {station.id}: {e}")
            summary["errors"].append({"station": station.id, "error": str(e)})
    return summary


async def run_full_ingest_with_status(pool: asyncpg.Pool) -> dict:
    """Same as run_full_ingest but also returns per-station status for /ingest/status."""
    statuses = []
    summary = {"total": 0, "by_source": {}, "errors": []}
    for station in STATIONS:
        entry = {"station_id": station.id, "place": station.place, "city": station.city}
        try:
            async with pool.acquire() as conn:
                reading, source = await _fetch_with_fallback(station, conn)
                result = compute_aqi(
                    pm25=reading.get("pm25"),
                    pm10=reading.get("pm10"),
                    no2=reading.get("no2"),
                    so2=reading.get("so2"),
                    co=reading.get("co"),
                    o3=reading.get("o3"),
                )
                await conn.execute(
                    """
                    INSERT INTO readings (station_id, pm25, pm10, no2, so2, co, o3,
                                         aqi, bucket, dominant, source, recorded_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
                    """,
                    station.id, reading["pm25"], reading["pm10"], reading["no2"], reading["so2"],
                    reading["co"], reading["o3"], int(result.aqi), result.bucket.label,
                    result.dominant_pollutant, source,
                )
            entry.update({
                "source": source,
                "aqi": int(result.aqi),
                "bucket": result.bucket.label,
                "dominant": result.dominant_pollutant,
                "pm25": round(reading["pm25"], 1),
                "pm10": round(reading["pm10"], 1),
                "status": "ok",
            })
            summary["total"] += 1
            summary["by_source"][source] = summary["by_source"].get(source, 0) + 1
        except Exception as e:
            log.exception(f"ingest failed for {station.id}: {e}")
            entry["status"] = "error"
            entry["error"] = str(e)
            summary["errors"].append({"station": station.id, "error": str(e)})
        statuses.append(entry)
    summary["stations"] = statuses
    return summary