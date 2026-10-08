"""
Threshold-based email alerts: detect AQI crossings for users and queue
threshold_alert emails.

Called by the ingest pipeline after every successful CPCB fetch. For each
user whose `users.default_(state, city, place)` matches the station, we
compare the new AQI to the previous reading. If it was below
`user_profiles.personal_threshold` in the previous hour and is at/above
the threshold now, that's a crossing — queue an email (subject to the
daily cap).

This is the only place threshold emails are queued. The email/scheduler.py
job picks up queued rows and sends them.
"""

from __future__ import annotations

from typing import Optional

import asyncpg

from app.compute.naqi import compute_aqi
from app.email.quota import check_and_increment_quota, ist_today
from app.email.resend_client import append_cap_notice


async def check_and_queue(
    conn: asyncpg.Connection,
    user_id: str,
    place_state: str, place_city: str, place_name: str,
    new_reading: dict,
    previous_aqi: Optional[float],
) -> Optional[str]:
    """Check if this reading is a fresh threshold crossing for the user.
    Returns the email_log id if an alert was queued, else None.
    """
    # 1. Load the user's threshold + email prefs
    prefs = await conn.fetchrow(
        """
        SELECT u.alert_threshold, u.email_alerts_enabled, u.email
        FROM users u WHERE u.id = $1
        """,
        user_id,
    )
    if not prefs or not prefs["email_alerts_enabled"]:
        return None
    threshold = prefs["alert_threshold"]
    if not prefs["email"]:
        return None

    # 2. Compute the AQI from the new reading
    result = compute_aqi(**new_reading)
    new_aqi = result.aqi

    # 3. Detect a fresh crossing: previous was below threshold, new is at/above
    # previous_aqi can be None for first reading of a station — treat as not-a-crossing
    if previous_aqi is None or previous_aqi >= threshold:
        return None
    if new_aqi < threshold:
        return None

    # 4. Check daily cap
    today = ist_today()
    allowed, count = await check_and_increment_quota(conn, user_id, today)
    if not allowed:
        return None

    # 5. Render + queue the email
    is_last_today = count == 2
    body_html = _render_threshold_html(
        place_name=place_name, aqi=int(new_aqi),
        bucket=result.bucket.label, dominant=result.dominant_pollutant,
    )
    if is_last_today:
        body_html = append_cap_notice(body_html)
    subject = f"🌫️ AQI just crossed {int(new_aqi)} in {place_name}"
    email_id = await conn.fetchval(
        """
        INSERT INTO email_log
            (user_id, kind, recipient, subject, body_md,
             related_state, related_city, related_place, status)
        VALUES ($1, 'threshold_alert', $2, $3, $4, $5, $6, $7, 'queued')
        RETURNING id
        """,
        user_id, prefs["email"], subject, body_html,
        place_state, place_city, place_name,
    )
    return str(email_id)


def _render_threshold_html(place_name: str, aqi: int, bucket: str, dominant: str) -> str:
    return f"""<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#111827;max-width:560px;margin:0 auto;padding:24px;">
  <h1 style="font-size:24px;margin:0 0 8px;">Aira AI — Threshold alert</h1>
  <p style="color:#4b5563;margin:0 0 24px;">The AQI in <strong>{place_name}</strong> just crossed your personal threshold.</p>
  <div style="background:#fef3c7;border:1px solid #d97706;border-radius:12px;padding:20px;margin:0 0 24px;">
    <div style="font-size:48px;font-weight:800;color:#d97706;line-height:1;">{aqi}</div>
    <div style="font-size:14px;font-weight:600;color:#92400e;margin-top:4px;">{bucket}</div>
    <div style="font-size:12px;color:#4b5563;margin-top:8px;">Dominant pollutant: {dominant}</div>
  </div>
  <p style="font-size:14px;line-height:1.6;">Limit prolonged outdoor exertion. Consider an N95 mask if you exercise outside. For personal medical advice, consult a doctor.</p>
  <p style="margin:24px 0 0;"><a href="https://aira.example/{'maharashtra'}/{'mumbai'}/{place_name.lower().replace(' ', '-')}" style="display:inline-block;padding:10px 18px;background:#0f4c75;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;">View full advisory</a></p>
  <p style="font-size:11px;color:#94a3b8;margin:24px 0 0;">You're receiving this because your personal threshold is set to this value. Manage your alerts at <a href="https://aira.example/settings/alerts" style="color:#94a3b8;">Settings → Alerts</a>.</p>
</body></html>"""
