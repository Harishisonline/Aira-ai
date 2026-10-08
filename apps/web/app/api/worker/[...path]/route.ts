/**
 * Worker proxy route. The browser cannot reach the worker directly
 * (CORS, different host in prod). The Next.js API routes proxy to the
 * worker using the internal token. This is a thin pass-through; the
 * worker does the real work.
 *
 * Path: /api/worker/[...path]
 *   GET  /api/worker/aqi/now?place=borivali   ->  GET {WORKER_URL}/aqi/now?place=borivali
 *   GET  /api/worker/aqi/forecast?place=...  ->  GET {WORKER_URL}/aqi/forecast?place=...
 *   GET  /api/worker/aqi/stations?state=...  ->  GET {WORKER_URL}/aqi/stations?state=...
 *   POST /api/worker/email/schedule          ->  POST {WORKER_URL}/email/schedule
 *   POST /api/worker/email/cancel/{id}       ->  POST {WORKER_URL}/email/cancel/{id}
 *   GET  /api/worker/email/quota/{user_id}  ->  GET {WORKER_URL}/email/quota/{user_id}
 *   GET  /api/worker/advisories/recent?user_id=&limit=  ->  GET {WORKER_URL}/advisories/recent?...
 *   POST /api/worker/advisories/refresh      ->  POST {WORKER_URL}/advisories/refresh
 *   POST /api/worker/ingest/run              ->  POST {WORKER_URL}/ingest/run
 *   GET  /api/worker/ingest/status?limit=    ->  GET {WORKER_URL}/ingest/status?limit=
 *
 * Next.js 15: params is now a Promise (for catch-all routes too). Must be awaited.
 */

import { NextRequest, NextResponse } from 'next/server';

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8000';
const WORKER_TOKEN = process.env.WORKER_INTERNAL_TOKEN || 'dev-internal-token';

type Params = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { path } = await params;
  return proxy(req, path, 'GET');
}
export async function POST(req: NextRequest, { params }: Params) {
  const { path } = await params;
  return proxy(req, path, 'POST');
}
export async function PUT(req: NextRequest, { params }: Params) {
  const { path } = await params;
  return proxy(req, path, 'PUT');
}
export async function DELETE(req: NextRequest, { params }: Params) {
  const { path } = await params;
  return proxy(req, path, 'DELETE');
}

async function proxy(req: NextRequest, pathParts: string[], method: string) {
  const path = '/' + (pathParts ?? []).join('/');
  const url = new URL(WORKER_URL + path);
  // Forward query string
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));
  // Forward body for non-GET
  let body: BodyInit | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    body = await req.text();
  }
  const upstream = await fetch(url.toString(), {
    method,
    headers: {
      'content-type': req.headers.get('content-type') ?? 'application/json',
      'x-internal-token': WORKER_TOKEN,
      'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '',
    },
    body,
    cache: 'no-store',
  });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
}