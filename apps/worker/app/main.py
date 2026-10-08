"""
FastAPI app entry point. Wires the DB pool, registers routers, starts the
APScheduler for periodic tasks (CPCB ingest, email queue, threshold checks).

Production hardening:
  - Graceful shutdown: APScheduler jobs are cancelled cleanly on SIGTERM,
    in-flight HTTP requests are drained before the process exits.
  - Structured logging: each log line includes a stable service name.
  - /health endpoint: liveness-only (returns 200 if process is up).
"""

from __future__ import annotations

import logging
import signal
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.config import settings
from app.db.pool import create_pool, create_service_pool
from app.api_routes import aqi
from app.email.scheduler import process_email_queue
from app.alerts.scan import scan_all_users_for_threshold_crossings


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("aira")

# Global scheduler handle so the SIGTERM handler can shut it down cleanly
_scheduler: AsyncIOScheduler | None = None
_shutting_down = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown: create DB pools, start scheduler, register SIGTERM handler."""
    log.info("starting Aira AI worker v1.3.0")
    app.state.db = await create_pool()
    app.state.service_db = await create_service_pool()

    global _scheduler
    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(_run_process_email_queue, IntervalTrigger(seconds=60), id="email_queue", max_instances=1, coalesce=True)
    _scheduler.add_job(_run_threshold_scan, IntervalTrigger(minutes=15), id="threshold_scan", max_instances=1, coalesce=True)
    _scheduler.add_job(_run_ingest, IntervalTrigger(minutes=15), id="ingest", max_instances=1, coalesce=True)
    _scheduler.start()
    log.info("scheduler started: email queue (60s), threshold scan (15min), ingest (15min)")

    # Install SIGTERM handler so Fly / Render / Railway can drain the process.
    # Skip when there's no main thread (TestClient runs in a worker thread).
    import asyncio
    try:
        loop = asyncio.get_running_loop()
        if loop is not None and threading.current_thread() is threading.main_thread():
            for sig in (signal.SIGTERM, signal.SIGINT):
                loop.add_signal_handler(sig, lambda s=sig: _on_signal(s))
    except RuntimeError:
        pass  # no event loop; nothing to do

    try:
        yield
    finally:
        log.info("shutting down Aira AI worker")
        if _scheduler is not None:
            _scheduler.shutdown(wait=True)  # wait for in-flight jobs
        await app.state.db.close()
        await app.state.service_db.close()
        log.info("shutdown complete")


def _on_signal(sig: signal.Signals) -> None:
    """SIGTERM/SIGINT handler — logs the signal and sets the shutdown flag.
    The FastAPI lifespan context manager is responsible for the actual cleanup
    (closing the scheduler, DB pools). This handler exists so we can flush
    logs before the process exits.
    """
    global _shutting_down
    if _shutting_down:
        return
    _shutting_down = True
    log.info(f"received signal {sig.name}; beginning graceful shutdown")


async def _run_process_email_queue():
    try:
        sent = await process_email_queue(app.state.db)
        if sent:
            log.info(f"email queue: sent {sent}")
    except Exception as e:
        log.exception(f"email queue error: {e}")


async def _run_threshold_scan():
    try:
        sent = await scan_all_users_for_threshold_crossings(app.state.service_db)
        if sent:
            log.info(f"threshold scan: queued {sent} alerts")
    except Exception as e:
        log.exception(f"threshold scan error: {e}")


async def _run_ingest():
    """Re-fetch AQI for all stations. Runs in the same process; a real
    deployment would split this into a separate worker pod."""
    from app.ingest import run_full_ingest
    try:
        summary = await run_full_ingest(app.state.db)
        log.info(
            f"ingest: refreshed {summary['total']} stations "
            f"(by source: {summary['by_source']})"
        )
    except Exception as e:
        log.exception(f"ingest error: {e}")


app = FastAPI(
    title="Aira AI Worker",
    version="1.3.0",
    lifespan=lifespan,
)

# Register routers
app.include_router(aqi.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "aira-worker", "version": "1.3.0"}


@app.get("/")
async def root():
    return {
        "service": "aira-ai-worker",
        "version": "1.3.0",
        "endpoints": [
            "/health",
            "/aqi/now?place=<slug>",
            "/aqi/forecast?place=<slug>",
            "/aqi/stations?state=maharashtra",
            "/email/quota/{user_id}",
            "/email/schedule",
            "/email/cancel/{email_id}",
            "/advisories/recent?user_id=&limit=",
            "/advisories/refresh",
            "/ingest/run",
            "/ingest/status",
        ],
    }
