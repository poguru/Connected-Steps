/**
 * Supabase-backed rate limiter — state persists across cold starts and
 * serverless function instances.
 *
 * Fallback chain on Supabase outage:
 *   1. Upstash Redis (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
 *   2. In-process Map (last resort — resets on cold start)
 *
 * Window: 15 minutes | Max failures before block: 5
 */

import { getSupabaseServer } from "@/lib/supabase-server";

export const WINDOW_MS    = 15 * 60 * 1000;  // 15 minutes
export const MAX_FAILURES = 5;

// ── Upstash Redis fallback ─────────────────────────────────────────────────
// Uses the REST API directly — no SDK needed, works in Edge/Node alike.

async function redisGet(key: string): Promise<string | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res  = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json() as { result: string | null };
    return data.result;
  } catch { return null; }
}

async function redisIncr(key: string, ttlSeconds: number): Promise<number | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    // INCR then EXPIRE in a pipeline (single HTTP request)
    const res  = await fetch(`${url}/pipeline`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify([["INCR", key], ["EXPIRE", key, ttlSeconds]]),
    });
    const data = await res.json() as [{ result: number }, unknown];
    return data[0]?.result ?? null;
  } catch { return null; }
}

async function redisCheck(key: string, max: number): Promise<boolean | null> {
  const val = await redisGet(key);
  if (val === null) return null;            // Redis unavailable
  return parseInt(val, 10) >= max;
}

// ── In-process fallback (last resort) ─────────────────────────────────────
interface Entry { failures: number; windowStart: number; }
declare global { var __rateLimitStore: Map<string, Entry> | undefined; }
const fallback: Map<string, Entry> = globalThis.__rateLimitStore
  ?? (globalThis.__rateLimitStore = new Map<string, Entry>());

function fbCheck(key: string, max: number, win: number): boolean {
  const now = Date.now();
  const e   = fallback.get(key);
  if (!e) return false;
  if (now - e.windowStart >= win) { fallback.delete(key); return false; }
  return e.failures >= max;
}

function fbRecord(key: string, win: number): number {
  const now = Date.now();
  const e   = fallback.get(key);
  if (!e || now - e.windowStart >= win) {
    fallback.set(key, { failures: 1, windowStart: now });
    return 1;
  }
  e.failures += 1;
  return e.failures;
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Extract the real client IP from Vercel / reverse-proxy headers. */
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Returns true if this key has exceeded maxFail failures within the
 * current window and further requests should be blocked.
 */
export async function isRateLimited(
  key: string,
  maxFail = MAX_FAILURES,
  winMs   = WINDOW_MS,
): Promise<boolean> {
  // 1. Try Supabase (primary)
  try {
    const db = getSupabaseServer();
    const { data } = await db
      .from("rate_limit_store")
      .select("failures, window_start")
      .eq("key", key)
      .maybeSingle();
    if (!data) return false;
    const expired = Date.now() - new Date(data.window_start as string).getTime() >= winMs;
    if (expired) return false;
    return (data.failures as number) >= maxFail;
  } catch { /* fall through */ }

  // 2. Try Upstash Redis (secondary)
  const redisResult = await redisCheck(`rl:${key}`, maxFail);
  if (redisResult !== null) return redisResult;

  // 3. In-process Map (last resort)
  return fbCheck(key, maxFail, winMs);
}

/**
 * Records one failed attempt. Returns the updated failure count.
 * Resets the window automatically if it has expired.
 */
export async function recordFailure(key: string, winMs = WINDOW_MS): Promise<number> {
  const ttlSeconds = Math.ceil(winMs / 1000);

  // 1. Try Supabase (primary)
  try {
    const db = getSupabaseServer();
    const { data } = await db.rpc("record_rate_limit_failure", {
      p_key:       key,
      p_window_ms: winMs,
    });
    // Mirror to Redis so fallback stays warm
    redisIncr(`rl:${key}`, ttlSeconds).catch(() => {});
    fbRecord(key, winMs);
    return (data as number) ?? 1;
  } catch { /* fall through */ }

  // 2. Try Upstash Redis (secondary)
  const redisCount = await redisIncr(`rl:${key}`, ttlSeconds);
  if (redisCount !== null) {
    fbRecord(key, winMs); // keep in-process warm too
    return redisCount;
  }

  // 3. In-process Map (last resort)
  return fbRecord(key, winMs);
}

/** Custom-window variant — used for phone OTP resend limiting. */
export async function isRateLimitedCustom(
  key:        string,
  maxAllowed: number,
  windowMs:   number,
): Promise<boolean> {
  return isRateLimited(key, maxAllowed, windowMs);
}

/** Custom-window variant — used for phone OTP resend limiting. */
export async function recordFailureCustom(key: string, windowMs: number): Promise<number> {
  return recordFailure(key, windowMs);
}

/**
 * Clears all rate-limit entries whose key starts with the given prefix.
 * Clears both the Supabase table and the in-process fallback cache.
 * Used by the test-utils reset endpoint.
 */
export async function clearRateLimitPrefix(prefix: string): Promise<number> {
  let cleared = 0;
  for (const key of fallback.keys()) {
    if (key.startsWith(prefix)) { fallback.delete(key); cleared++; }
  }
  try {
    const db = getSupabaseServer();
    const { data } = await db
      .from("rate_limit_store")
      .delete()
      .like("key", `${prefix}%`)
      .select("key");
    cleared = Math.max(cleared, (data ?? []).length);
  } catch { /* ignore — best effort */ }
  return cleared;
}
