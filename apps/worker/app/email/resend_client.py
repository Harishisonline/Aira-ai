"""
Resend transactional email client.

All email sending goes through this module. We use Resend because Supabase
has no transactional email product (only auth magic links, which we don't
control). Free tier: 100 emails/day, 3000/month — exceeds v1's expected
volume (a few hundred per day at most).

Environment: RESEND_API_KEY and RESEND_FROM must be set. RESEND_FROM is the
sender envelope, default 'Aira AI <hello@aira.example>'. In production set
this to a verified custom domain like 'Aira AI <hello@aira.ai>'.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import httpx


RESEND_API_URL = "https://api.resend.com/emails"
TIMEOUT_S = 10.0


def _api_key() -> str:
    key = os.environ.get("RESEND_API_KEY")
    if not key:
        raise RuntimeError("RESEND_API_KEY env var is not set")
    return key


def _from_addr() -> str:
    return os.environ.get("RESEND_FROM", "Aira AI <hello@aira.example>")


@dataclass
class SendResult:
    success: bool
    resend_id: Optional[str] = None
    error: Optional[str] = None


def send_email(
    to: str,
    subject: str,
    html: str,
    text: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> SendResult:
    """Send a single email via Resend. Returns SendResult.
    `text` is a plain-text fallback (good practice; some clients block HTML).
    `reply_to` lets the user reply directly to Aira's support address.
    """
    payload = {
        "from": _from_addr(),
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text
    if reply_to:
        payload["reply_to"] = reply_to
    headers = {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=TIMEOUT_S) as client:
            r = client.post(RESEND_API_URL, json=payload, headers=headers)
            r.raise_for_status()
            data = r.json()
        return SendResult(success=True, resend_id=data.get("id"))
    except httpx.HTTPStatusError as e:
        body = ""
        try:
            body = e.response.text[:500]
        except Exception:
            pass
        return SendResult(success=False, error=f"resend_{e.response.status_code}: {body}")
    except httpx.TimeoutException:
        return SendResult(success=False, error="resend_timeout")
    except Exception as e:
        return SendResult(success=False, error=f"resend_unknown: {e}")


# --- Daily cap notice (appended to the 2nd email of the day) -----------------

DAILY_CAP_NOTICE_HTML = """
<div style="margin-top:24px;padding:16px 20px;background:#fef3c7;border-left:4px solid #d97706;border-radius:8px;font-size:14px;color:#78350f;">
  <strong>You've reached today's free email limit.</strong>
  <div style="margin-top:6px;">Want more frequent Aira updates? A paid tier is coming soon. For now, you'll be back in the queue tomorrow (midnight IST).</div>
</div>
"""


def append_cap_notice(html: str) -> str:
    """Inject the daily-cap notice before the closing </body> of an HTML email."""
    return html.replace("</body>", DAILY_CAP_NOTICE_HTML + "</body>")


# --- CLI test (no actual send without RESEND_API_KEY) -----------------------

if __name__ == "__main__":
    if not os.environ.get("RESEND_API_KEY"):
        print("RESEND_API_KEY not set; skipping smoke test")
    else:
        r = send_email(
            to="test@example.com",
            subject="Aira AI test",
            html="<p>Test body</p>",
        )
        print(f"Sent: {r.success}, id={r.resend_id}, err={r.error}")
