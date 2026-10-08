"""
Daily email quota: max 2 emails per user per day, IST timezone.

The cap is shared between threshold alerts and LLM-scheduled emails. The
2nd email of the day includes a 'daily cap notice' appended to its body
(handled by resend_client.append_cap_notice). The 3rd attempt in a day
returns False and the caller skips the send.

This is implemented as a single atomic UPSERT on email_quota keyed by
(user_id, IST date). The increment happens in the same statement, so
concurrent sends from multiple worker processes can't exceed the cap.
"""

from __future__ import annotations

from datetime import date
from typing import Tuple

import asyncpg


DAILY_CAP = 2


async def check_and_increment_quota(
    conn: asyncpg.Connection, user_id: str, today_ist: date,
) -> Tuple[bool, int]:
    """Atomic check-and-increment.
    Returns (allowed, new_count).
    If allowed is False, new_count is the cap (so the caller knows the cap
    was hit but doesn't double-increment).
    """
    row = await conn.fetchrow(
        """
        INSERT INTO email_quota (user_id, quota_date, count, last_sent_at)
        VALUES ($1, $2, 1, NOW())
        ON CONFLICT (user_id, quota_date)
        DO UPDATE SET count = email_quota.count + 1, last_sent_at = NOW()
        RETURNING count
        """,
        user_id, today_ist,
    )
    new_count = row["count"]
    if new_count > DAILY_CAP:
        # Roll back the increment so the user isn't permanently locked out
        await conn.execute(
            "UPDATE email_quota SET count = count - 1 WHERE user_id = $1 AND quota_date = $2",
            user_id, today_ist,
        )
        return False, DAILY_CAP
    return True, new_count


def ist_today() -> date:
    """Return today's date in IST (UTC+5:30)."""
    from datetime import datetime, timezone, timedelta
    ist = timezone(timedelta(hours=5, minutes=30))
    return datetime.now(ist).date()
