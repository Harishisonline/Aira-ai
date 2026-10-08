/**
 * In-memory rate limiter for routes that need DoS protection but
 * don't warrant a Redis dependency. Uses a sliding window over
 * the last N seconds. Resets on process restart.
 *
 * NOT suitable for multi-instance deployments (use Redis or
 * Supabase for that). For Aira's v1 (Vercel + single Fly worker),
 * the per-process counter is enough for "destructive account ops".
 *
 * Usage:
 *   const check = rateLimit({ key: 'delete:' + userId, max: 3, window: 3600 });
 *   if (!check.ok) return new Response('Too many', { status: 429 });
 */

type Entry = { ts: number[] };
const STORE = new Map<string, Entry>();

export interface RateLimitConfig {
  /** Stable key per (route + user/IP). e.g. `delete:userId` or `signin:ip` */
  key: string;
  /** Max events allowed in the window */
  max: number;
  /** Window length in seconds */
  window: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Unix-epoch seconds when the next request will be allowed */
  retryAfter: number;
}

export function rateLimit(cfg: RateLimitConfig): RateLimitResult {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - cfg.window;
  const entry = STORE.get(cfg.key) ?? { ts: [] };
  // Prune timestamps outside the window
  entry.ts = entry.ts.filter(t => t > cutoff);
  if (entry.ts.length >= cfg.max) {
    const oldest = entry.ts[0];
    return {
      ok: false,
      remaining: 0,
      retryAfter: oldest + cfg.window - now,
    };
  }
  entry.ts.push(now);
  STORE.set(cfg.key, entry);
  return { ok: true, remaining: cfg.max - entry.ts.length, retryAfter: 0 };
}

/** Reset the rate limiter (test-only). */
export function _resetRateLimit(): void {
  STORE.clear();
}
