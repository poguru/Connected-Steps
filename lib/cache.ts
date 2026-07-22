/**
 * Application-level Redis cache — Upstash REST API.
 *
 * Uses the same env vars and HTTP pattern as lib/rate-limit.ts:
 *   UPSTASH_REDIS_REST_URL   — full Upstash endpoint
 *   UPSTASH_REDIS_REST_TOKEN — bearer token
 *
 * Design rules:
 *   • Every operation is fire-and-forget safe — errors are swallowed so cache
 *     failures NEVER block a request or change the response.
 *   • When Redis is not configured (env vars absent) every operation is a no-op.
 *   • Cache stores JSON-serialised values; callers pass/receive typed objects.
 *   • Keys are namespaced and versioned (v1:) so a server-side bump clears stale data.
 *
 * Caller contract:
 *   null from cacheGet  → cache miss; fall through to DB
 *   value from cacheGet → serve directly
 *   void from cacheSet  → fire-and-forget; never await the return value in hot paths
 *   void from cacheDel  → await when correctness matters (write-then-invalidate)
 */

// ── Low-level Upstash REST helpers ───────────────────────────────────────────

function redisUrl():   string | undefined { return process.env.UPSTASH_REDIS_REST_URL; }
function redisToken(): string | undefined { return process.env.UPSTASH_REDIS_REST_TOKEN; }

/** GET /get/{key} → { result: string | null } */
async function rawGet(key: string): Promise<string | null> {
  const url   = redisUrl();
  const token = redisToken();
  if (!url || !token) return null;
  const res  = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
    // Don't let Next.js data-cache wrap this fetch — always fresh from Redis
    cache: "no-store",
  });
  const json = await res.json() as { result: string | null };
  return json.result;
}

/** POST /pipeline with a batch of Redis commands. Each command is [CMD, arg, arg, …]. */
async function pipeline(commands: (string | number)[][]): Promise<void> {
  const url   = redisUrl();
  const token = redisToken();
  if (!url || !token) return;
  await fetch(`${url}/pipeline`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify(commands),
    cache:   "no-store",
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return cached value or null on miss / error / unconfigured.
 * Generic — caller decides the type.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await rawGet(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;  // parse error or network failure → treat as miss
  }
}

/**
 * Store value in Redis with a TTL (seconds).
 * Non-blocking — callers should `void cacheSet(...)` unless they must await.
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await pipeline([["SET", key, JSON.stringify(value), "EX", ttlSeconds]]);
  } catch {
    // Non-fatal — cache write failure is invisible to callers
  }
}

/**
 * Delete one or more keys.
 * Await this in write handlers to ensure invalidation happens before response.
 */
export async function cacheDel(...keys: string[]): Promise<void> {
  if (!keys.length) return;
  try {
    await pipeline(keys.map(k => ["DEL", k]));
  } catch {
    // Non-fatal
  }
}

/**
 * Delete all keys matching a glob pattern using SCAN + DEL.
 * Used to flush all leaderboard cache variants (location, friends) at once
 * so no variant can serve stale data after a recalculation.
 */
export async function cacheFlushPattern(pattern: string): Promise<void> {
  const url   = redisUrl();
  const token = redisToken();
  if (!url || !token) return;
  try {
    // SCAN 0 MATCH <pattern> COUNT 200 — enough for all leaderboard variants
    const scanRes = await fetch(`${url}/scan/0/match/${encodeURIComponent(pattern)}/count/200`, {
      headers: { Authorization: `Bearer ${token}` },
      cache:   "no-store",
    });
    const scanJson = await scanRes.json() as { result: [string, string[]] };
    const keys = scanJson?.result?.[1] ?? [];
    if (keys.length > 0) {
      await pipeline(keys.map(k => ["DEL", k]));
    }
  } catch {
    // Non-fatal — worst case: stale cache expires naturally within its TTL
  }
}

// ── Cache key constructors ────────────────────────────────────────────────────

export const CK = {
  /**
   * Leaderboard list.
   * Keyed on (locationId, friendsOf) — not on callerEmail, because is_me/user_email
   * decoration is applied in-memory after retrieval, so the cached rows are safe
   * to share across callers with the same filter combination.
   */
  leaderboard: (locationId: string | null, friendsOf: string | null): string =>
    `lb:v1:${locationId ?? "_"}:${friendsOf ?? "_"}`,

  /**
   * Admin dashboard statistics.
   * Keyed on YYYY-MM so the key naturally rotates on the 1st of every month.
   */
  adminDashboard: (monthKey: string): string =>
    `admin:dash:v1:${monthKey}`,

  /**
   * Session RSVP / attendance counts for a set of session IDs.
   * IDs are sorted before joining so the key is order-independent.
   */
  sessionRsvpCounts: (sessionIds: string[]): string =>
    `sess:rsvp:v1:${[...sessionIds].sort().join(":")}`,

  /**
   * A user's session membership list (joined / attended session IDs).
   * User-scoped — invalidated on every join/leave action.
   */
  userJoinedSessions: (email: string): string =>
    `user:joined:v1:${email.toLowerCase()}`,

  /**
   * A user's achievement summary (sessionCount, leaderboardRank, hasMembership).
   * User-scoped — invalidated after attendance scan and membership changes.
   */
  userAchievements: (email: string): string =>
    `user:achv:v1:${email.toLowerCase()}`,
};

// ── TTL constants (seconds) ───────────────────────────────────────────────────

export const TTL = {
  leaderboard:         30,   // fresh enough; CDN already caches at 30 s
  adminDashboard:      60,   // admins can tolerate 1-minute lag
  sessionRsvpCounts:   30,   // minor count jitter acceptable
  userJoinedSessions:  30,   // invalidated explicitly on write
  userAchievements:    60,   // invalidated explicitly after attendance scan
} as const;

// ── Row type stored for leaderboard cache ─────────────────────────────────────

/**
 * Leaderboard rows as stored in Redis.
 * `_raw_email` holds the actual email for server-side `is_me` decoration and
 * is NEVER returned to clients — it is stripped when building the response.
 */
export type LbCacheRow = {
  id:              string;
  _raw_email:      string;         // internal; stripped before sending to clients
  user_name:       string;
  location:        string | null;
  goal:            string | null;
  month_points:    number;
  total_points:    number;
  week_points:     number;
  prev_month_rank: number | null;
  updated_at:      string | null;
  photo:           string | null;
};

/**
 * Apply per-request user-specific decoration.
 * Converts cached rows → response entries with correct user_email / is_me.
 */
export function decorateLb(
  rows:        LbCacheRow[],
  callerEmail: string | null,
): Record<string, unknown>[] {
  return rows.map(({ _raw_email, ...rest }) => ({
    ...rest,
    user_email: callerEmail ? _raw_email : null,
    is_me:      callerEmail
      ? _raw_email.toLowerCase() === callerEmail.toLowerCase()
      : false,
  }));
}
