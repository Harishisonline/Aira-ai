"""
Threshold scan: for every user with email_alerts_enabled=true, check if
their default place just crossed above their alert_threshold in the most
recent ingest. If so, queue a threshold_alert email.

Called every 15 minutes by the scheduler in main.py.
"""

from __future__ import annotations

import logging
from typing import Optional

import asyncpg

from app.alerts.threshold import check_and_queue
from app.fetchers.cpcb import STATIONS
from app.compute.naqi import compute_aqi


log = logging.getLogger("aira.threshold_scan")


async def scan_all_users_for_threshold_crossings(service_db: asyncpg.Pool) -> int:
    """Check all users with alerts enabled. Returns the number of alerts queued.
    Uses the service_role pool so we can read across all users.
    """
    # Get all users with alerts enabled
    async with service_db.acquire() as conn:
        users = await conn.fetch(
            """
            SELECT u.id, u.alert_threshold, u.default_state, u.default_city, u.default_place
            FROM users u
            WHERE u.email_alerts_enabled = TRUE
        """
        )
        stations_by_id = {s.id: s for s in STATIONS}
        queued = 0
        for u in users:
            # Find the station for their default place
            station = None
            for s in STATIONS:
                if s.state == u["default_state"].capitalize() and \
                   s.city == u["default_city"].capitalize() and \
                   s.place == u["default_place"]:
                    station = s
                    break
            if station is None:
                continue
            # Get the latest two readings
            readings = await conn.fetch(
                """
                SELECT aqi, pm25, pm10, no2, so2, co, o3, recorded_at
                FROM readings
                WHERE station_id = $1
                ORDER BY recorded_at DESC
                LIMIT 2
            """,
                station.id,
            )
            if len(readings) < 2:
                continue
            new = readings[0]
            previous = readings[1]
            try:
                # Use the reading dict to recompute; the row's aqi should match
                # but recompute to be safe and to capture dominant correctly
                naqi = compute_aqi(
                    pm25=float(new["pm25"]), pm10=float(new["pm10"]),
                    no2=float(new["no2"]), so2=float(new["so2"]),
                    co=float(new["co"]), o3=float(new["o3"]),
                )
                email_id = await check_and_queue(
                    conn=conn,
                    user_id=str(u["id"]),
                    place_state=u["default_state"],
                    place_city=u["default_city"],
                    place_name=u["default_place"],
                    new_reading={
                        "pm25": float(new["pm25"]), "pm10": float(new["pm10"]),
                        "no2": float(new["no2"]), "so2": float(new["so2"]),
                        "co": float(new["co"]), "o3": float(new["o3"]),
                    },
                    previous_aqi=float(previous["aqi"]) if previous["aqi"] is not None else None,
                )
                if email_id:
                    queued += 1
            except Exception as e:
                log.exception(f"threshold check failed for user {u['id']}: {e}")
        return queued
