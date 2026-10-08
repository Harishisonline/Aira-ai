"""
Schema migration runner. Runs all .sql files in app/db/migrations/ in order.
Idempotent (uses CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, etc.).
Run on app startup, or standalone via `python3 -m app.db.migrate`.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import asyncpg

from app.config import settings


log = logging.getLogger("aira.migrate")
MIGRATIONS_DIR = Path(__file__).parent / "migrations"


async def run_migrations():
    """Apply every .sql file in order."""
    conn = await asyncpg.connect(dsn=settings.database_url)
    try:
        files = sorted(MIGRATIONS_DIR.glob("*.sql"))
        for f in files:
            log.info(f"applying migration: {f.name}")
            sql = f.read_text()
            await conn.execute(sql)
        log.info(f"applied {len(files)} migrations")
    finally:
        await conn.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_migrations())
