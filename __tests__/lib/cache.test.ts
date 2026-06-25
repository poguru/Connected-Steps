// Tests for lib/cache.ts
//
// Covers:
//  • cacheGet: miss (null result), hit (parsed value), error swallowed
//  • cacheSet: calls pipeline with SET + EX, errors swallowed
//  • cacheDel: calls pipeline with DEL commands, handles 0/1/N keys
//  • No-op when env vars absent
//  • CK key constructors produce stable, unique keys
//  • decorateLb applies is_me / user_email correctly (public vs authenticated)

process.env.UPSTASH_REDIS_REST_URL   = "https://redis.example.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

// Mock global fetch so no real HTTP calls are made
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { cacheGet, cacheSet, cacheDel, CK, TTL, decorateLb, type LbCacheRow } from "@/lib/cache";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a fetch mock that resolves with { result: value }. */
function fetchReturning(result: unknown) {
  mockFetch.mockResolvedValue({
    json: () => Promise.resolve({ result }),
  } as Response);
}

/** Build a fetch mock that rejects (network error). */
function fetchFailing() {
  mockFetch.mockRejectedValue(new Error("network error"));
}

/** Capture the JSON body of the last pipeline POST call. */
function lastPipelineBody(): (string | number)[][] {
  const call = mockFetch.mock.calls.find(c => (c[1] as RequestInit)?.method === "POST");
  return JSON.parse((call?.[1] as RequestInit)?.body as string) as (string | number)[][];
}

beforeEach(() => mockFetch.mockReset());

// ── cacheGet ──────────────────────────────────────────────────────────────────

describe("cacheGet", () => {
  test("returns null on cache miss (Redis result: null)", async () => {
    fetchReturning(null);
    expect(await cacheGet("some-key")).toBeNull();
  });

  test("returns parsed value on cache hit", async () => {
    const value = { sessionCount: 42, leaderboardRank: 3, hasMembership: true };
    fetchReturning(JSON.stringify(value));
    expect(await cacheGet("some-key")).toEqual(value);
  });

  test("returns null when Redis returns an unparseable string", async () => {
    fetchReturning("not-valid-json{{{{");
    expect(await cacheGet("some-key")).toBeNull();
  });

  test("returns null and swallows network error", async () => {
    fetchFailing();
    await expect(cacheGet("some-key")).resolves.toBeNull();
  });

  test("returns null when env vars are absent", async () => {
    const url   = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const result = await cacheGet("key");

    process.env.UPSTASH_REDIS_REST_URL   = url;
    process.env.UPSTASH_REDIS_REST_TOKEN = token;

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("uses no-store cache directive to bypass Next.js data cache", async () => {
    fetchReturning(null);
    await cacheGet("key");
    const opts = mockFetch.mock.calls[0][1] as RequestInit;
    expect(opts.cache).toBe("no-store");
  });

  test("URL-encodes the key in the GET request path", async () => {
    fetchReturning(null);
    await cacheGet("user:achv:v1:alice@cs.test");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain(encodeURIComponent("user:achv:v1:alice@cs.test"));
  });
});

// ── cacheSet ─────────────────────────────────────────────────────────────────

describe("cacheSet", () => {
  test("sends SET + EX via pipeline with correct key, value, and TTL", async () => {
    mockFetch.mockResolvedValue({ json: () => Promise.resolve([{ result: "OK" }]) } as Response);

    await cacheSet("lb:v1:_:_", { entries: [] }, 30);

    const body = lastPipelineBody();
    expect(body).toHaveLength(1);
    expect(body[0][0]).toBe("SET");
    expect(body[0][1]).toBe("lb:v1:_:_");
    expect(JSON.parse(body[0][2] as string)).toEqual({ entries: [] });
    expect(body[0][3]).toBe("EX");
    expect(body[0][4]).toBe(30);
  });

  test("swallows network error without throwing", async () => {
    fetchFailing();
    await expect(cacheSet("k", {}, 60)).resolves.toBeUndefined();
  });

  test("is a no-op when env vars are absent", async () => {
    const url   = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    await cacheSet("k", { x: 1 }, 30);

    process.env.UPSTASH_REDIS_REST_URL   = url;
    process.env.UPSTASH_REDIS_REST_TOKEN = token;

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── cacheDel ─────────────────────────────────────────────────────────────────

describe("cacheDel", () => {
  test("sends DEL commands for each key via pipeline", async () => {
    mockFetch.mockResolvedValue({ json: () => Promise.resolve([{ result: 1 }, { result: 1 }]) } as Response);

    await cacheDel("key-a", "key-b");

    const body = lastPipelineBody();
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual(["DEL", "key-a"]);
    expect(body[1]).toEqual(["DEL", "key-b"]);
  });

  test("single key sends a single DEL command", async () => {
    mockFetch.mockResolvedValue({ json: () => Promise.resolve([{ result: 1 }]) } as Response);

    await cacheDel("only-key");

    const body = lastPipelineBody();
    expect(body).toHaveLength(1);
    expect(body[0]).toEqual(["DEL", "only-key"]);
  });

  test("does nothing when called with zero keys", async () => {
    await cacheDel();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("swallows network error without throwing", async () => {
    fetchFailing();
    await expect(cacheDel("k1", "k2")).resolves.toBeUndefined();
  });
});

// ── CK cache key constructors ─────────────────────────────────────────────────

describe("CK cache keys", () => {
  test("leaderboard: global leaderboard key is stable", () => {
    expect(CK.leaderboard(null, null)).toBe("lb:v1:_:_");
  });

  test("leaderboard: location-scoped key differs from global", () => {
    const k = CK.leaderboard("uuid-123", null);
    expect(k).toBe("lb:v1:uuid-123:_");
    expect(k).not.toBe(CK.leaderboard(null, null));
  });

  test("leaderboard: friends-of key differs from global", () => {
    const k = CK.leaderboard(null, "alice@cs.test");
    expect(k).toBe("lb:v1:_:alice@cs.test");
    expect(k).not.toBe(CK.leaderboard(null, null));
  });

  test("adminDashboard: key encodes the month", () => {
    expect(CK.adminDashboard("2026-06")).toBe("admin:dash:v1:2026-06");
    expect(CK.adminDashboard("2026-07")).not.toBe(CK.adminDashboard("2026-06"));
  });

  test("sessionRsvpCounts: key is order-independent", () => {
    const k1 = CK.sessionRsvpCounts(["s1", "s2", "s3"]);
    const k2 = CK.sessionRsvpCounts(["s3", "s1", "s2"]);
    expect(k1).toBe(k2);
  });

  test("sessionRsvpCounts: different sets produce different keys", () => {
    expect(CK.sessionRsvpCounts(["s1"])).not.toBe(CK.sessionRsvpCounts(["s2"]));
  });

  test("userJoinedSessions: lowercases the email", () => {
    const k1 = CK.userJoinedSessions("Alice@CS.test");
    const k2 = CK.userJoinedSessions("alice@cs.test");
    expect(k1).toBe(k2);
  });

  test("userAchievements: lowercases the email", () => {
    const k1 = CK.userAchievements("BOB@CS.TEST");
    const k2 = CK.userAchievements("bob@cs.test");
    expect(k1).toBe(k2);
  });

  test("all five key types are distinct for the same input", () => {
    const keys = [
      CK.leaderboard(null, null),
      CK.adminDashboard("2026-06"),
      CK.sessionRsvpCounts(["s1"]),
      CK.userJoinedSessions("a@cs.test"),
      CK.userAchievements("a@cs.test"),
    ];
    const unique = new Set(keys);
    expect(unique.size).toBe(5);
  });
});

// ── TTL constants ─────────────────────────────────────────────────────────────

describe("TTL constants", () => {
  test("all TTLs are in the 30–60 second range", () => {
    for (const [name, seconds] of Object.entries(TTL)) {
      expect(seconds).toBeGreaterThanOrEqual(30);
      expect(seconds).toBeLessThanOrEqual(60);
      // Fail clearly if a constant is accidentally changed
      expect(`${name}=${seconds}`).toMatch(/=\d+/);
    }
  });
});

// ── decorateLb ────────────────────────────────────────────────────────────────

describe("decorateLb", () => {
  const rows: LbCacheRow[] = [
    { id: "1", _raw_email: "alice@cs.test", user_name: "Alice", location: "Hyd",
      goal: "5k", month_points: 50, total_points: 200, week_points: 10,
      prev_month_rank: 2, updated_at: "2026-06-01T00:00:00Z", photo: null },
    { id: "2", _raw_email: "bob@cs.test", user_name: "Bob", location: "Hyd",
      goal: "10k", month_points: 40, total_points: 180, week_points: 5,
      prev_month_rank: 3, updated_at: "2026-06-01T00:00:00Z", photo: null },
  ];

  test("public caller (null email): user_email=null, is_me=false for all rows", () => {
    const result = decorateLb(rows, null);
    for (const r of result) {
      expect(r.user_email).toBeNull();
      expect(r.is_me).toBe(false);
    }
  });

  test("authenticated caller sees actual emails in user_email field", () => {
    const result = decorateLb(rows, "alice@cs.test");
    expect(result[0].user_email).toBe("alice@cs.test");
    expect(result[1].user_email).toBe("bob@cs.test");
  });

  test("is_me=true only for the caller's own row", () => {
    const result = decorateLb(rows, "alice@cs.test");
    expect(result[0].is_me).toBe(true);   // alice's row
    expect(result[1].is_me).toBe(false);  // bob's row
  });

  test("email comparison is case-insensitive", () => {
    const result = decorateLb(rows, "ALICE@CS.TEST");
    expect(result[0].is_me).toBe(true);
  });

  test("_raw_email is NOT present in any output row", () => {
    const result = decorateLb(rows, "alice@cs.test");
    for (const r of result) {
      expect("_raw_email" in r).toBe(false);
    }
  });

  test("all other fields are preserved from the cache row", () => {
    const result = decorateLb(rows, null);
    expect(result[0].id).toBe("1");
    expect(result[0].user_name).toBe("Alice");
    expect(result[0].month_points).toBe(50);
    expect(result[0].photo).toBeNull();
  });

  test("empty row array returns empty array", () => {
    expect(decorateLb([], "alice@cs.test")).toEqual([]);
  });
});
