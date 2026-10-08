"""
HTTP endpoints that expose the AQI math to the Next.js chat route and
the rest of the web layer. This is the only Python file the web layer
calls; everything else stays internal to the worker.

Three endpoints, all GET or POST, all return JSON:
  GET  /aqi/now?place=<slug>         -> current AQI + 6 pollutants
  GET  /aqi/forecast?place=<slug>    -> 7-day forecast
  GET  /aqi/stations?state=<state>    -> station list with current AQI
  GET  /email/quota/{user_id}         -> today's email count for the user
  POST /email/schedule                -> schedule a future email (LLM-scheduled)
  POST /email/cancel/{email_id}       -> cancel a scheduled email
  GET  /advisories/recent?user_id=&limit=  -> recent advisories for a user
  POST /advisories/refresh            -> regenerate the cached advisory for a place+profile

All endpoints read from Postgres, never from in-memory state. Reads are
fresh (no caching at the worker level; the chat route can cache).
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone, timedelta
from typing import List, Optional

import asyncpg
from fastapi import APIRouter, HTTPException, Query, Request

from app.compute.naqi import compute_aqi
from app.compute.forecast import forecast_7day
from app.email.quota import check_and_increment_quota, ist_today
from app.fetchers.cpcb import STATIONS, find_station, fetch_reading
from app.llm.groq import generate_advisory, generate_compare_report

log = logging.getLogger("aira.worker.aqi")
router = APIRouter()


# --- /aqi/now ---------------------------------------------------------------

@router.get("/aqi/now")
async def aqi_now(request: Request, place: str = Query(..., description="Place slug, e.g. 'borivali'")):
    """Return the current AQI + all 6 pollutants for a place.
    Reads the latest reading from Postgres; if the most recent reading is
    older than 2 hours, the route flags it stale and the worker triggers
    a CPCB fetch.
    """
    pool: asyncpg.Pool = request.app.state.db
    station = find_station(place)
    if station is None:
        raise HTTPException(404, f"unknown place: {place!r}")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT pm25, pm10, no2, so2, co, o3, aqi, bucket, dominant, recorded_at
            FROM readings
            WHERE station_id = $1
            ORDER BY recorded_at DESC
            LIMIT 1
            """,
            station.id,
        )
    if row is None:
        # No reading yet for this station; trigger a fresh fetch
        reading, live = fetch_reading(station)
        result = compute_aqi(**reading)
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO readings (station_id, pm25, pm10, no2, so2, co, o3, aqi, bucket, dominant, source, recorded_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
                """,
                station.id, reading["pm25"], reading["pm10"], reading["no2"], reading["so2"],
                reading["co"], reading["o3"], int(result.aqi), result.bucket.label, result.dominant_pollutant,
                "live" if live else "mock",
            )
        return {
            "place": station.place,
            "city": station.city,
            "aqi": int(result.aqi),
            "bucket": result.bucket.label,
            "pm25": reading["pm25"], "pm10": reading["pm10"],
            "no2": reading["no2"], "so2": reading["so2"],
            "co": reading["co"], "o3": reading["o3"],
            "dominant": result.dominant_pollutant,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "stale": False,
        }
    # Check staleness (> 2 hours = stale)
    recorded = row["recorded_at"]
    if recorded.tzinfo is None:
        recorded = recorded.replace(tzinfo=timezone.utc)
    stale = (datetime.now(timezone.utc) - recorded) > timedelta(hours=2)
    return {
        "place": station.place,
        "city": station.city,
        "aqi": row["aqi"],
        "bucket": row["bucket"],
        "pm25": float(row["pm25"]), "pm10": float(row["pm10"]),
        "no2": float(row["no2"]), "so2": float(row["so2"]),
        "co": float(row["co"]), "o3": float(row["o3"]),
        "dominant": row["dominant"],
        "recorded_at": recorded.isoformat(),
        "stale": stale,
    }


# --- /aqi/forecast ---------------------------------------------------------

@router.get("/aqi/forecast")
async def aqi_forecast(request: Request, place: str = Query(...)):
    """7-day AQI forecast for a place. Computed from the last 30 days."""
    pool: asyncpg.Pool = request.app.state.db
    station = find_station(place)
    if station is None:
        raise HTTPException(404, f"unknown place: {place!r}")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT date_trunc('day', recorded_at) AS d, AVG(aqi) AS avg_aqi
            FROM readings
            WHERE station_id = $1 AND recorded_at > NOW() - INTERVAL '30 days'
            GROUP BY d
            ORDER BY d ASC
            """,
            station.id,
        )
    if len(rows) < 2:
        raise HTTPException(409, f"not enough history for {place!r} (need ≥2 days)")
    history = [(r["d"].date(), float(r["avg_aqi"])) for r in rows]
    result = forecast_7day(history)
    return {
        "place": station.place,
        "r_squared": result.r_squared,
        "model_version": result.model_version,
        "points": [
            {
                "date": p.forecast_date.isoformat(),
                "predicted_aqi": p.predicted_aqi,
                "confidence_low": p.confidence_low,
                "confidence_high": p.confidence_high,
            } for p in result.points
        ],
    }


# --- /aqi/stations ---------------------------------------------------------

@router.get("/aqi/stations")
async def aqi_stations(request: Request, state: str = Query("maharashtra")):
    """List all stations in a state with their current AQI."""
    pool: asyncpg.Pool = request.app.state.db
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT s.id, s.name, s.state, s.city, s.place, s.lat, s.lng, s.operator,
                   r.aqi, r.bucket, r.dominant
            FROM stations s
            LEFT JOIN LATERAL (
                SELECT aqi, bucket, dominant FROM readings
                WHERE station_id = s.id
                ORDER BY recorded_at DESC LIMIT 1
            ) r ON true
            WHERE s.state = $1 AND s.is_active = true
            ORDER BY s.city, s.place
            """,
            state.capitalize() if state else "Maharashtra",
        )
    return {
        "state": state,
        "stations": [
            {
                "id": r["id"], "name": r["name"], "state": r["state"],
                "city": r["city"], "place": r["place"],
                "lat": float(r["lat"]), "lng": float(r["lng"]),
                "operator": r["operator"],
                "aqi": r["aqi"], "bucket": r["bucket"], "dominant": r["dominant"],
            } for r in rows
        ],
    }


# --- /email/quota/{user_id} -----------------------------------------------

@router.get("/email/quota/{user_id}")
async def email_quota(request: Request, user_id: str):
    pool: asyncpg.Pool = request.app.state.db
    today = ist_today()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT count, last_sent_at FROM email_quota WHERE user_id = $1 AND quota_date = $2",
            user_id, today,
        )
    return {
        "user_id": user_id,
        "date": today.isoformat(),
        "count": row["count"] if row else 0,
        "remaining": max(0, 2 - (row["count"] if row else 0)),
        "last_sent_at": row["last_sent_at"].isoformat() if row and row["last_sent_at"] else None,
    }


# --- /email/schedule -------------------------------------------------------

@router.post("/email/schedule")
async def email_schedule(request: Request):
    """Schedule a one-time future email. Body: { user_id, when_iso, topic, place_slug }"""
    pool: asyncpg.Pool = request.app.state.db
    body = await request.json()
    user_id = body.get("user_id")
    when_iso = body.get("when_iso")
    topic = body.get("topic")
    place_slug = body.get("place_slug")
    if not all([user_id, when_iso, topic, place_slug]):
        raise HTTPException(400, "user_id, when_iso, topic, place_slug are all required")
    # Validate when_iso
    try:
        when = datetime.fromisoformat(when_iso.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        raise HTTPException(400, "when_iso must be ISO-8601")
    if when <= datetime.now(timezone.utc):
        raise HTTPException(400, "when_iso must be in the future")
    if when > datetime.now(timezone.utc) + timedelta(days=7):
        raise HTTPException(400, "when_iso must be within 7 days")
    # Validate place
    station = find_station(place_slug)
    if station is None:
        raise HTTPException(404, f"unknown place: {place_slug!r}")
    # Get user email
    async with pool.acquire() as conn:
        urow = await conn.fetchrow("SELECT email, email_alerts_enabled FROM users WHERE id = $1", user_id)
        if not urow or not urow["email_alerts_enabled"]:
            raise HTTPException(403, "email alerts disabled for this user")
        # Check quota (don't increment here; increment at send time)
        today = ist_today()
        qrow = await conn.fetchrow(
            "SELECT count FROM email_quota WHERE user_id = $1 AND quota_date = $2",
            user_id, today,
        )
        if qrow and qrow["count"] >= 2:
            raise HTTPException(403, "daily_email_cap_exceeded")
        # Insert
        row = await conn.fetchrow(
            """
            INSERT INTO email_log
                (user_id, kind, recipient, subject, body_md,
                 related_state, related_city, related_place,
                 related_when, scheduled_for, status)
            VALUES ($1, 'scheduled', $2, $3, $4, $5, $6, $7, $8, $9, 'queued')
            RETURNING id
            """,
            user_id, urow["email"],
            f"📬 AQI update for {station.place} you asked for",
            topic,
            station.state, station.city, station.place,
            when, when,
        )
    return {
        "scheduled_id": str(row["id"]),
        "when_iso": when_iso,
        "recipient": urow["email"],
        "fetch_strategy": "at_send_time",
    }


# --- /email/cancel/{email_id} ---------------------------------------------

@router.post("/email/cancel/{email_id}")
async def email_cancel(email_id: str, request: Request):
    """Cancel a scheduled email. Only the owner can cancel."""
    pool: asyncpg.Pool = request.app.state.db
    body = await request.json()
    user_id = body.get("user_id")
    if not user_id:
        raise HTTPException(400, "user_id required")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE email_log SET status = 'cancelled' WHERE id = $1 AND user_id = $2 AND status = 'queued' RETURNING id",
            email_id, user_id,
        )
    if not row:
        raise HTTPException(404, "no queued email with that id for this user")
    return {"ok": True, "cancelled_id": str(row["id"])}


# --- /advisories/recent ---------------------------------------------------

@router.get("/advisories/recent")
async def advisories_recent(request: Request, user_id: str = Query(...), limit: int = Query(5, ge=1, le=20)):
    pool: asyncpg.Pool = request.app.state.db
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT a.body_md, a.profile_type, a.generated_at, av.viewed_at,
                   s.state, s.city, s.place
            FROM advisory_views av
            JOIN advisories a ON a.id = av.advisory_id
            JOIN stations s ON s.id = a.station_id
            WHERE av.user_id = $1
            ORDER BY av.viewed_at DESC
            LIMIT $2
            """,
            user_id, limit,
        )
    return {
        "advisories": [
            {
                "city": f"{r['place']}, {r['city']}",
                "profile": r["profile_type"],
                "body": r["body_md"],
                "viewed_at": r["viewed_at"].isoformat(),
            } for r in rows
        ]
    }


# --- /advisories/refresh ---------------------------------------------------

@router.post("/advisories/refresh")
async def advisories_refresh(request: Request):
    """Regenerate the cached advisory for a place+profile. Body: { user_id, profile }.
    The LLM is called fresh (not cached at the worker level). The result is
    persisted to the advisories table and the user's last-viewed entry in
    advisory_views is updated.
    """
    pool: asyncpg.Pool = request.app.state.db
    body = await request.json()
    user_id = body.get("user_id")
    profile = body.get("profile", "healthy")
    if not user_id:
        raise HTTPException(400, "user_id required")
    async with pool.acquire() as conn:
        urow = await conn.fetchrow("SELECT default_state, default_city, default_place FROM users WHERE id = $1", user_id)
        if not urow:
            raise HTTPException(404, "user not found")
    place_slug = urow["default_place"].lower().replace(" ", "-")
    # Fetch live AQI for the user's area
    aqi_resp = await aqi_now(place=place_slug)
    # 7-day forecast
    fc_resp = await aqi_forecast(place=place_slug)
    forecast_summary = ", ".join(
        f"{p['date']}: {int(p['predicted_aqi'])}" for p in fc_resp["points"][:3]
    )
    # Get the profile advice line from NAQI
    from app.compute.naqi import advice_for
    profile_line = advice_for(profile, aqi_resp["bucket"])
    # Generate the advisory
    text, model = generate_advisory(
        profile=profile, place_name=f"{urow['default_place']}, {urow['default_city']}",
        aqi=aqi_resp["aqi"], bucket=aqi_resp["bucket"], dominant=aqi_resp["dominant"],
        profile_line=profile_line, forecast_summary=forecast_summary,
    )
    # Persist
    async with pool.acquire() as conn:
        srow = await conn.fetchrow(
            "SELECT id FROM stations WHERE state = $1 AND city = $2 AND place = $3",
            urow["default_state"], urow["default_city"], urow["default_place"],
        )
        if srow:
            arow = await conn.fetchrow(
                """
                INSERT INTO advisories (station_id, profile_type, body_md, model_version, generated_at, expires_at)
                VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '1 hour')
                RETURNING id
                """,
                srow["id"], profile, text, model,
            )
            await conn.execute(
                "INSERT INTO advisory_views (user_id, advisory_id, viewed_at) VALUES ($1, $2, NOW()) ON CONFLICT (user_id, advisory_id) DO UPDATE SET viewed_at = NOW()",
                user_id, arow["id"],
            )
    return {"advisory": text, "model": model}


# --- /ingest/run -----------------------------------------------------------

@router.post("/ingest/run")
async def ingest_run(request: Request):
    """Trigger a full ingest cycle across all 30 stations and return the
    per-station status (which tier served each station).

    The scheduler also calls this every 15 minutes; the endpoint exists
    for manual triggering from the web admin.
    """
    pool: asyncpg.Pool = request.app.state.db
    from app.ingest import run_full_ingest_with_status
    summary = await run_full_ingest_with_status(pool)
    return summary


@router.get("/ingest/status")
async def ingest_status(request: Request, limit: int = Query(20, ge=1, le=100)):
    """Show the most recent readings per station, including the source
    (openaq, cpcb_live, mock_past, last_known, baseline).

    Useful for verifying the fallback system: at a glance you can see how
    many stations are on live vs mock.
    """
    pool: asyncpg.Pool = request.app.state.db
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT station_id, pm25, pm10, aqi, bucket, source, recorded_at
            FROM (
                SELECT station_id, pm25, pm10, aqi, bucket, source, recorded_at,
                       ROW_NUMBER() OVER (PARTITION BY station_id ORDER BY recorded_at DESC) AS rn
                FROM readings
            ) latest
            WHERE rn = 1
            ORDER BY recorded_at DESC
            LIMIT $1
            """,
            limit,
        )
    return {
        "readings": [
            {
                "station_id": r["station_id"],
                "pm25": float(r["pm25"]) if r["pm25"] is not None else None,
                "pm10": float(r["pm10"]) if r["pm10"] is not None else None,
                "aqi": r["aqi"],
                "bucket": r["bucket"],
                "source": r["source"],
                "recorded_at": r["recorded_at"].isoformat(),
            } for r in rows
        ],
    }
