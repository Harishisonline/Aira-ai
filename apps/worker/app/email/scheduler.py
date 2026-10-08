"""
Email scheduler: APScheduler job that picks up queued email_log rows and
sends them via Resend.

Runs every 60 seconds. Uses `FOR UPDATE SKIP LOCKED` so multiple worker
processes don't double-send the same row.

For scheduled emails, the body is built FRESH at send time (not snapshotted
when the user asked Aira). This means the user always gets the AQI as of
the moment the email is sent, not as of when they asked for it.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List

import asyncpg

from app.email.resend_client import send_email, append_cap_notice
from app.email.quota import ist_today
from app.compute.naqi import compute_aqi
from app.compute.forecast import forecast_7day
from app.llm.groq import generate_compare_report  # unused here; reserved


log = logging.getLogger("aira.email.scheduler")
BATCH_SIZE = 20


async def process_email_queue(conn: asyncpg.Connection) -> int:
    """Process pending emails. Returns the number sent.
    Called every 60s by APScheduler.
    """
    # Claim a batch of ready rows atomically
    rows = await conn.fetch(
        """
        UPDATE email_log
        SET status = 'processing'
        WHERE id IN (
            SELECT id FROM email_log
            WHERE status = 'queued' AND scheduled_for <= NOW()
            ORDER BY scheduled_for ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING *
        """,
        BATCH_SIZE,
    )
    sent = 0
    for row in rows:
        try:
            body_html = await _render_body(conn, row)
            # Append cap notice if this is the 2nd email of the day
            count_today = await conn.fetchval(
                "SELECT count FROM email_quota WHERE user_id = $1 AND quota_date = $2",
                row["user_id"], ist_today(),
            )
            if count_today and count_today >= 2:
                body_html = append_cap_notice(body_html)
            result = send_email(
                to=row["recipient"],
                subject=row["subject"],
                html=body_html,
                text=None,
            )
            if result.success:
                await conn.execute(
                    """
                    UPDATE email_log
                    SET status = 'sent', sent_at = NOW(), resend_id = $1
                    WHERE id = $2
                    """,
                    result.resend_id, row["id"],
                )
                sent += 1
            else:
                # Decrement quota since the send failed
                await conn.execute(
                    "UPDATE email_quota SET count = count - 1 WHERE user_id = $1 AND quota_date = $2",
                    row["user_id"], ist_today(),
                )
                await conn.execute(
                    """
                    UPDATE email_log
                    SET status = 'failed', failure_reason = $1
                    WHERE id = $2
                    """,
                    result.error, row["id"],
                )
        except Exception as e:
            log.exception("email send failed for %s", row["id"])
            await conn.execute(
                "UPDATE email_log SET status = 'failed', failure_reason = $1 WHERE id = $2",
                f"exception: {e!r}", row["id"],
            )
    return sent


async def _render_body(conn: asyncpg.Connection, row) -> str:
    """Build the email body fresh at send time.
    For scheduled emails, this fetches the AQI/forecast AS OF NOW for the
    related place. The user always gets the latest data, not a snapshot.
    """
    if row["kind"] == "scheduled":
        # Fetch live data for the related place
        from app.fetchers.cpcb import find_station, fetch_reading
        from datetime import date, timedelta
        # related_state + related_city + related_place
        place_slug = row["related_place"].lower().replace(" ", "-")
        station = find_station(place_slug)
        if station is None:
            return f"<p>Aira could not find station {row['related_place']} for your scheduled report.</p>"
        reading, _ = fetch_reading(station)
        naqi = compute_aqi(**reading)
        # Render scheduled report
        return _render_scheduled_html(
            place_name=row["related_place"],
            aqi=int(naqi.aqi),
            bucket=naqi.bucket.label,
            dominant=naqi.dominant_pollutant,
            topic=row.get("body_md", "AQI update"),
        )
    elif row["kind"] == "threshold_alert":
        # Body was pre-rendered when the alert was queued; just return it
        return row["body_md"] or "<p>(empty threshold alert)</p>"
    else:
        return row["body_md"] or "<p>(empty email)</p>"


def _render_scheduled_html(place_name: str, aqi: int, bucket: str, dominant: str, topic: str) -> str:
    return f"""<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#111827;max-width:560px;margin:0 auto;padding:24px;">
  <h1 style="font-size:24px;margin:0 0 8px;">Aira AI — Scheduled AQI report</h1>
  <p style="color:#4b5563;margin:0 0 24px;">You asked Aira to send you a report about <strong>{topic}</strong> for {place_name}. Here's the current air quality:</p>
  <div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:0 0 24px;">
    <div style="font-size:48px;font-weight:800;color:#111827;line-height:1;">{aqi}</div>
    <div style="font-size:14px;font-weight:600;color:#4b5563;margin-top:4px;">{bucket}</div>
    <div style="font-size:12px;color:#4b5563;margin-top:8px;">Dominant pollutant: {dominant}</div>
  </div>
  <p style="font-size:14px;line-height:1.6;">Manage your scheduled reports at <a href="https://aira.example/settings/alerts" style="color:#0f4c75;">Settings → Alerts</a>.</p>
</body></html>"""
