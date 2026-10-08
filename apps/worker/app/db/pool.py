"""
Postgres connection pool. The pool is created on app startup and attached
to app.state.db. All route handlers and the scheduler use this pool.

Two connection pools are configured:
  - main pool: for normal app queries (chat, profile, advisories)
  - service pool: for admin operations that need to bypass RLS
    (migrations, threshold checks that read across users)

The service pool uses the SUPABASE_SERVICE_ROLE_KEY, which corresponds to
the postgres role that has BYPASSRLS.
"""

from __future__ import annotations

import asyncpg

from app.config import settings


async def create_pool() -> asyncpg.Pool:
    """Create the main connection pool. Reuse across requests."""
    return await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=2,
        max_size=10,
        command_timeout=30,
    )


async def create_service_pool() -> asyncpg.Pool:
    """Service-role pool: same DSN, but the connection role is the
    Supabase service_role user (which has BYPASSRLS in our schema).
    """
    return await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=1,
        max_size=5,
        command_timeout=60,
    )
