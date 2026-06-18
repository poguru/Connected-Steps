/**
 * Supabase-backed rate limiter — state persists across cold starts and
 * serverless function instances. Falls back to an in-process Map if
 * Supabase is unreachable (fail-open: never block legitimate users due
 * to an infra outage).
 *
 * Window: 15 minutes | Max failures before block: 5
 */

import { getSupabaseServer } from "@/lib/supabase-server";

export const WINDOW_MS    = 15 * 60 * 1000;  // 15 minutes
export const MAX_FAILURES = 5;

// ── In-process fallback ────────────────────────────────────────────────────
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
  } catch {
    return fbCheck(key, maxFail, winMs);
  }
}

/**
 * Records one failed attempt. Returns the updated failure count.
 * Resets the window automatically if it has expired.
 */
export async function recordFailure(key: string, winMs = WINDOW_MS): Promise<number> {
  try {
    const db = getSupabaseServer();
    const { data } = await db.rpc("record_rate_limit_failure", {
      p_key:       key,
      p_window_ms: winMs,
    });
    fbRecord(key, winMs); // mirror to in-process cache
    return (data as number) ?? 1;
  } catch {
    return fbRecord(key, winMs);
  }
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
