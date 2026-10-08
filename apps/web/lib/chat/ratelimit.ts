/**
 * Per-user daily chat limit + per-session LRU cache.
 * The chat route enforces a hard cap of 50 messages per user per day.
 * Repeat questions within a session are served from an in-memory LRU
 * keyed by sha256(question + frozen_context). Cache TTL = 5 minutes.
 *
 * For production this is a single instance; if we scale to multiple
 * instances, the cache should move to Redis with the same key shape.
 *
 * Uses the Web Crypto API (subtle.digest) instead of Node's `crypto` module
 * so this module is compatible with the Edge runtime.
 */

export const DAILY_MESSAGE_CAP = 50;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

interface CacheEntry {
  text: string;
  model: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function cacheKey(question: string, frozenContextHash: string): Promise<string> {
  return sha256Hex(question + '|' + frozenContextHash);
}

function evictExpired(now: number): void {
  for (const [k, v] of cache) {
    if (v.expiresAt < now) cache.delete(k);
  }
  // LRU-ish: if still over the limit, drop the oldest entries
  if (cache.size > CACHE_MAX_ENTRIES) {
    const overflow = cache.size - CACHE_MAX_ENTRIES;
    const it = cache.keys();
    for (let i = 0; i < overflow; i++) {
      const k = it.next().value;
      if (k) cache.delete(k);
    }
  }
}

export function cacheGet(key: string): { text: string; model: string } | null {
  const now = Date.now();
  evictExpired(now);
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < now) {
    cache.delete(key);
    return null;
  }
  return { text: entry.text, model: entry.model };
}

export function cachePut(key: string, text: string, model: string): void {
  const now = Date.now();
  evictExpired(now);
  cache.set(key, { text, model, expiresAt: now + CACHE_TTL_MS });
}

export async function hashFrozenContext(ctx: unknown): Promise<string> {
  return sha256Hex(JSON.stringify(ctx));
}

export async function cacheKeyFor(question: string, ctx: unknown): Promise<string> {
  return cacheKey(question, await hashFrozenContext(ctx));
}

/**
 * Daily message counter. Stored in chat_messages table, queried by the route.
 * Returns true if the user is under the cap, false if at/over.
 *
 * This is a thin wrapper; the actual DB call is in the route handler.
 * We keep the constant here for clarity.
 */
