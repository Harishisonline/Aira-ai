/**
 * GET /api/health -- used by Docker healthcheck and uptime monitors.
 *
 * Returns a structured health report that distinguishes liveness from
 * readiness. Liveness is always true (the process is up). Readiness
 * is true only when the Supabase REST gateway is reachable.
 *
 * Response shape:
 *   {
 *     ok: boolean,            // overall: true if readiness is good
 *     service: 'aira-web',
 *     version: '1.3.0',
 *     ts: ISO-8601,
 *     checks: {
 *       liveness: { ok: true },
 *       database: { ok, latencyMs, error? },
 *       worker:   { ok, latencyMs, error?, skipped? }  // skipped if WORKER_URL is unset or local
 *     }
 *   }
 *
 * Status code: 200 if ok, 503 if not (so Docker / Render / Railway
 * healthcheck can mark the service unhealthy).
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const WORKER_URL = process.env.WORKER_URL ?? '';

async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    return { ok: false, latencyMs: 0, error: 'NEXT_PUBLIC_SUPABASE_URL or ANON_KEY not set' };
  }
  const t0 = Date.now();
  try {
    // Hit a real lightweight table. `stations` has 30 rows and is publicly
    // readable via RLS (anon can SELECT). If the key is valid, we get 200;
    // if invalid, 401.
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/stations?select=id&limit=1`,
      {
        method: 'GET',
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
        signal: AbortSignal.timeout(3000),
      },
    );
    const latencyMs = Date.now() - t0;
    if (!r.ok) {
      return { ok: false, latencyMs, error: `HTTP ${r.status}` };
    }
    return { ok: true, latencyMs };
  } catch (e: any) {
    return { ok: false, latencyMs: Date.now() - t0, error: e?.message ?? String(e) };
  }
}

function workerUrlIsUnroutable(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  try {
    const host = new URL(trimmed).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1';
  } catch {
    return true;
  }
}

async function checkWorker(): Promise<{ ok: boolean; latencyMs: number; error?: string; skipped?: boolean }> {
  // localhost from a Vercel function never reaches a worker. Skip instead of
  // waiting on a connection that cannot succeed. A public worker URL is checked
  // without WORKER_INTERNAL_TOKEN; /health is a status route, not an auth gate.
  if (workerUrlIsUnroutable(WORKER_URL)) {
    return { ok: true, latencyMs: 0, skipped: true };
  }
  const t0 = Date.now();
  try {
    const r = await fetch(`${WORKER_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - t0;
    if (!r.ok) return { ok: false, latencyMs, error: `HTTP ${r.status}` };
    return { ok: true, latencyMs };
  } catch (e: any) {
    return { ok: false, latencyMs: Date.now() - t0, error: e?.message ?? String(e) };
  }
}

export async function GET() {
  const [db, worker] = await Promise.all([checkDatabase(), checkWorker()]);
  // Only the database gates the HTTP status. The worker is best-effort:
  // pages read directly from Supabase REST, so a missing worker doesn't
  // make the web unhealthy. Worker status is still reported in `checks`
  // for monitoring, but won't flip the status code to 503.
  const ok = db.ok;
  return NextResponse.json(
    {
      ok,
      ...(worker.skipped ? { message: 'Worker not deployed (set WORKER_URL to enable).' } : {}),
      service: 'aira-web',
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? '1.3.0',
      ts: new Date().toISOString(),
      checks: {
        liveness: { ok: true },
        database: db,
        worker,
      },
    },
    { status: ok ? 200 : 503 },
  );
}
