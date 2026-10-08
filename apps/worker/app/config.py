"""
Centralized config. Reads from .env via python-dotenv. Every other module
imports `settings` from here.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


# Load .env from the repo root (one level up from apps/worker/)
_env_path = Path(__file__).resolve().parents[3] / ".env"
if _env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(_env_path)


@dataclass(frozen=True)
class Settings:
    # Postgres
    database_url: str = os.environ.get(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/aira",
    )

    # Supabase
    supabase_url: str = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    supabase_anon_key: str = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    supabase_service_role_key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    # Groq
    groq_api_key: str = os.environ.get("GROQ_API_KEY", "")

    # Email
    resend_api_key: str = os.environ.get("RESEND_API_KEY", "")
    resend_from: str = os.environ.get("RESEND_FROM", "Aira AI <onresend.com>")
    # SMTP (used by MailHog in dev, real SMTP in prod)
    smtp_host: str = os.environ.get("SMTP_HOST", "")
    smtp_port: int = int(os.environ.get("SMTP_PORT", "1025"))
    smtp_from: str = os.environ.get("SMTP_FROM", "Aira AI <test@aira.local>")
    smtp_user: str = os.environ.get("SMTP_USER", "")
    smtp_password: str = os.environ.get("SMTP_PASSWORD", "")

    # AQI data sources (tried in order: openaq, cpcb, mock_past, baseline)
    openaq_key: str = os.environ.get("OPENAQ_KEY", "")
    cpcb_api_key: str = os.environ.get("CPCB_API_KEY", "")
    aqi_fallback_to_mock: bool = os.environ.get("AQI_FALLBACK_TO_MOCK", "true").lower() == "true"

    # Service URLs
    web_url: str = os.environ.get("WEB_URL", "http://localhost:3000")
    worker_url: str = os.environ.get("WORKER_URL", "http://localhost:8000")
    worker_internal_token: str = os.environ.get("WORKER_INTERNAL_TOKEN", "dev-internal-token")


settings = Settings()
