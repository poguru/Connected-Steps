/**
 * Edge-compatible in-memory rate limiter.
 *
 * State lives in the module-level Map, which persists across requests
 * within a warm isolate (Vercel Edge Middleware or Node.js API route).
 * Cold starts reset the store — acceptable for this use case; the
 * alternative would require external KV storage.
 *
 * Window: 15 minutes | Max failures before block: 5
 */

export const WINDOW_MS    = 15 * 60 * 1000;  // 15 minutes
export const MAX_FAILURES = 5;

interface Entry { failures: number; windowStart: number; }
const store = new Map<string, Entry>();

/** Extract the real client IP from Vercel / reverse-proxy headers. */
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Returns true if this key has exceeded MAX_FAILURES within the current
 * window and further requests should be blocked.
 * Expired entries are evicted lazily on read.
 */
export function isRateLimited(key: string): boolean {
  const now   = Date.now();
  const entry = store.get(key);
  if (!entry) return false;
  if (now - entry.windowStart >= WINDOW_MS) {
    store.delete(key);
    return false;
  }
  return entry.failures >= MAX_FAILURES;
}

/**
 * Records one failed attempt for this key.
 * Returns the updated failure count so callers can log "n / MAX_FAILURES".
 * Resets the window if the previous one has expired.
 */
export function recordFailure(key: string): number {
  const now   = Date.now();
  const entry = store.get(key);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    store.set(key, { failures: 1, windowStart: now });
    return 1;
  }
  entry.failures += 1;
  return entry.failures;
}
