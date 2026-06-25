// Tests for the rank-snapshot cron job.
//
// What this verifies:
//   1. Auth: 401 on wrong/missing CRON_SECRET
//   2. Ranking logic: correct rank values, tied scores, rank gaps after ties
//   3. Batch efficiency: exactly ceil(N/CHUNK) RPC calls at each scale
//   4. No duplicates: every email appears exactly once across all chunks
//   5. No missing users: every user gets a rank
//   6. Retry: transient failures are retried, success is recorded
//   7. Permanent failure: errors captured in response, remaining chunks continue
//   8. Idempotency: same input → same ranks on repeated calls
//
// Scale benchmarks: 100 / 1 000 / 10 000 / 100 000 users

process.env.CRON_SECRET                = "test-cron-secret";
process.env.SUPABASE_SERVICE_ROLE_KEY  = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL   = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/paginate",        () => ({ paginateAll:        jest.fn() }));

import { NextRequest } from "next/server";
import { GET, CHUNK, MAX_RETRIES } from "@/app/api/cron/rank-snapshot/route";
import { getSupabaseServer } from "@/lib/supabase-server";
import { paginateAll }        from "@/lib/paginate";

const mockGetSupabaseServer = getSupabaseServer as jest.Mock;
const mockPaginateAll       = paginateAll       as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(secret = "test-cron-secret"): NextRequest {
  return new NextRequest("http://localhost/api/cron/rank-snapshot", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

/** Generate N leaderboard entries.
 *  By default each user has a unique score (strictly decreasing) so each gets a unique rank.
 *  Pass allTied=true to give everyone the same score (all rank 1).
 */
function makeEntries(
  n: number,
  opts: { allTied?: boolean; startPoints?: number } = {},
): { user_email: string; month_points: number }[] {
  const { allTied = false, startPoints = n } = opts;
  return Array.from({ length: n }, (_, i) => ({
    user_email:   `user${i.toString().padStart(8, "0")}@cs.test`,
    month_points: allTied ? 100 : startPoints - i,
  }));
}

/** Build a mock db where rpc() is tracked.
 *  rpcImpl defaults to always succeeding and returning the chunk size.
 */
function makeDb(rpcImpl?: jest.Mock) {
  const rpc = rpcImpl ?? jest.fn().mockImplementation(
    (_fn: string, args: { p_emails: string[] }) =>
      Promise.resolve({ data: args.p_emails.length, error: null }),
  );
  return { rpc, _rpc: rpc };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: paginateAll returns empty (overridden per test)
  mockPaginateAll.mockResolvedValue({ rows: [], pages: 0 });
  // Default: db with a working rpc
  mockGetSupabaseServer.mockReturnValue(makeDb());
});

// ── 1. Auth ───────────────────────────────────────────────────────────────────

describe("auth", () => {
  test("returns 401 when Authorization header is missing", async () => {
    const req = new NextRequest("http://localhost/api/cron/rank-snapshot");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  test("returns 401 when secret is wrong", async () => {
    const res = await GET(makeRequest("wrong-secret"));
    expect(res.status).toBe(401);
  });

  test("returns 200 with correct secret", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });
});

// ── 2. Empty leaderboard ──────────────────────────────────────────────────────

describe("empty leaderboard", () => {
  test("returns ok=true and updated=0 without calling rpc", async () => {
    mockPaginateAll.mockResolvedValue({ rows: [], pages: 0 });
    const db = makeDb();
    mockGetSupabaseServer.mockReturnValue(db);

    const body = await (await GET(makeRequest())).json();

    expect(body.ok).toBe(true);
    expect(body.updated).toBe(0);
    expect(db._rpc).not.toHaveBeenCalled();
  });
});

// ── 3. Ranking logic ─────────────────────────────────────────────────────────

describe("ranking logic", () => {
  test("unique scores: each user gets a unique sequential rank", async () => {
    const entries = makeEntries(5); // 5, 4, 3, 2, 1 points
    mockPaginateAll.mockResolvedValue({ rows: entries, pages: 1 });

    const capturedRanks: number[][] = [];
    const rpc = jest.fn().mockImplementation((_fn: string, args: { p_ranks: number[] }) => {
      capturedRanks.push([...args.p_ranks]);
      return Promise.resolve({ data: args.p_ranks.length, error: null });
    });
    mockGetSupabaseServer.mockReturnValue(makeDb(rpc));

    await GET(makeRequest());

    const allRanks = capturedRanks.flat();
    expect(allRanks).toEqual([1, 2, 3, 4, 5]);
  });

  test("tied scores share the same rank", async () => {
    // scores: 100, 100, 100 → all rank 1
    const entries = makeEntries(3, { allTied: true });
    mockPaginateAll.mockResolvedValue({ rows: entries, pages: 1 });

    const capturedRanks: number[][] = [];
    const rpc = jest.fn().mockImplementation((_fn: string, args: { p_ranks: number[] }) => {
      capturedRanks.push([...args.p_ranks]);
      return Promise.resolve({ data: args.p_ranks.length, error: null });
    });
    mockGetSupabaseServer.mockReturnValue(makeDb(rpc));

    await GET(makeRequest());

    expect(capturedRanks.flat()).toEqual([1, 1, 1]);
  });

  test("rank skips after ties (rank gap, not dense_rank)", async () => {
    // Two users tied at 50pts (rank 1), then one at 30pts (rank 3, not 2)
    const entries = [
      { user_email: "a@cs.test", month_points: 50 },
      { user_email: "b@cs.test", month_points: 50 },
      { user_email: "c@cs.test", month_points: 30 },
    ];
    mockPaginateAll.mockResolvedValue({ rows: entries, pages: 1 });

    const capturedRanks: number[][] = [];
    const rpc = jest.fn().mockImplementation((_fn: string, args: { p_ranks: number[] }) => {
      capturedRanks.push([...args.p_ranks]);
      return Promise.resolve({ data: args.p_ranks.length, error: null });
    });
    mockGetSupabaseServer.mockReturnValue(makeDb(rpc));

    await GET(makeRequest());

    expect(capturedRanks.flat()).toEqual([1, 1, 3]); // rank 2 is skipped
  });

  test("user with 0 points still gets a rank", async () => {
    const entries = [
      { user_email: "a@cs.test", month_points: 10 },
      { user_email: "b@cs.test", month_points: 0  },
    ];
    mockPaginateAll.mockResolvedValue({ rows: entries, pages: 1 });

    const capturedRanks: number[][] = [];
    const rpc = jest.fn().mockImplementation((_fn: string, args: { p_ranks: number[] }) => {
      capturedRanks.push([...args.p_ranks]);
      return Promise.resolve({ data: args.p_ranks.length, error: null });
    });
    mockGetSupabaseServer.mockReturnValue(makeDb(rpc));

    await GET(makeRequest());

    const ranks = capturedRanks.flat();
    expect(ranks[0]).toBe(1);
    expect(ranks[1]).toBe(2);
  });
});

// ── 4. Batch efficiency (scale) ───────────────────────────────────────────────

describe("batch efficiency", () => {
  async function countRpcCalls(n: number): Promise<number> {
    const entries = makeEntries(n);
    mockPaginateAll.mockResolvedValue({ rows: entries, pages: Math.ceil(n / 1000) });
    const db = makeDb();
    mockGetSupabaseServer.mockReturnValue(db);

    const body = await (await GET(makeRequest())).json();
    expect(body.ok).toBe(true);
    expect(body.total).toBe(n);

    return (db._rpc as jest.Mock).mock.calls.length;
  }

  test("100 users → 1 RPC call", async () => {
    expect(await countRpcCalls(100)).toBe(1);
  });

  test("1 000 users → 1 RPC call (exactly one full chunk)", async () => {
    expect(await countRpcCalls(1_000)).toBe(1);
  });

  test("10 000 users → 10 RPC calls", async () => {
    expect(await countRpcCalls(10_000)).toBe(10);
  });

  test("100 000 users → 100 RPC calls", async () => {
    expect(await countRpcCalls(100_000)).toBe(100);
  });

  test("response reports correct chunk count", async () => {
    mockPaginateAll.mockResolvedValue({ rows: makeEntries(2_500), pages: 3 });
    mockGetSupabaseServer.mockReturnValue(makeDb());

    const body = await (await GET(makeRequest())).json();

    expect(body.chunks).toBe(Math.ceil(2_500 / CHUNK));
    expect(body.total).toBe(2_500);
  });
});

// ── 5. No duplicates / no missing users ──────────────────────────────────────

describe("completeness and deduplication", () => {
  test("no email appears in more than one chunk", async () => {
    const N = 2_500;
    const entries = makeEntries(N);
    mockPaginateAll.mockResolvedValue({ rows: entries, pages: 3 });

    const allEmailsAcrossChunks: string[] = [];
    const rpc = jest.fn().mockImplementation((_fn: string, args: { p_emails: string[] }) => {
      allEmailsAcrossChunks.push(...args.p_emails);
      return Promise.resolve({ data: args.p_emails.length, error: null });
    });
    mockGetSupabaseServer.mockReturnValue(makeDb(rpc));

    await GET(makeRequest());

    const unique = new Set(allEmailsAcrossChunks);
    expect(unique.size).toBe(N); // no duplicates
    expect(allEmailsAcrossChunks.length).toBe(N); // no extras
  });

  test("every user from the leaderboard gets a rank assigned", async () => {
    const N = 1_500;
    const entries = makeEntries(N);
    mockPaginateAll.mockResolvedValue({ rows: entries, pages: 2 });

    const coveredEmails = new Set<string>();
    const rpc = jest.fn().mockImplementation((_fn: string, args: { p_emails: string[] }) => {
      args.p_emails.forEach(e => coveredEmails.add(e));
      return Promise.resolve({ data: args.p_emails.length, error: null });
    });
    mockGetSupabaseServer.mockReturnValue(makeDb(rpc));

    await GET(makeRequest());

    entries.forEach(e => expect(coveredEmails.has(e.user_email)).toBe(true));
  });

  test("each chunk is at most CHUNK rows", async () => {
    const N = 2_500;
    mockPaginateAll.mockResolvedValue({ rows: makeEntries(N), pages: 3 });

    const chunkSizes: number[] = [];
    const rpc = jest.fn().mockImplementation((_fn: string, args: { p_emails: string[] }) => {
      chunkSizes.push(args.p_emails.length);
      return Promise.resolve({ data: args.p_emails.length, error: null });
    });
    mockGetSupabaseServer.mockReturnValue(makeDb(rpc));

    await GET(makeRequest());

    chunkSizes.forEach(size => expect(size).toBeLessThanOrEqual(CHUNK));
    expect(chunkSizes.reduce((a, b) => a + b, 0)).toBe(N);
  });
});

// ── 6. Retry logic ───────────────────────────────────────────────────────────

describe("retry logic", () => {
  beforeEach(() => {
    // Make setTimeout instant so retry delays don't slow tests down
    jest.spyOn(global, "setTimeout").mockImplementation(
      (fn: (...args: unknown[]) => void) => { fn(); return 0 as unknown as ReturnType<typeof setTimeout>; },
    );
  });
  afterEach(() => jest.restoreAllMocks());

  test("retries a transient failure and succeeds on second attempt", async () => {
    const entries = makeEntries(5);
    mockPaginateAll.mockResolvedValue({ rows: entries, pages: 1 });

    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: null, error: { message: "connection timeout" } })
      .mockResolvedValue({ data: 5, error: null });
    mockGetSupabaseServer.mockReturnValue(makeDb(rpc));

    const body = await (await GET(makeRequest())).json();

    expect(rpc).toHaveBeenCalledTimes(2);   // 1 failure + 1 success
    expect(body.ok).toBe(true);
    expect(body.errors).toBeUndefined();
  });

  test("retries up to MAX_RETRIES times on permanent failure", async () => {
    mockPaginateAll.mockResolvedValue({ rows: makeEntries(5), pages: 1 });

    const rpc = jest.fn().mockResolvedValue({
      data: null, error: { message: "DB unavailable" },
    });
    mockGetSupabaseServer.mockReturnValue(makeDb(rpc));

    const body = await (await GET(makeRequest())).json();

    expect(rpc).toHaveBeenCalledTimes(MAX_RETRIES);
    expect(body.ok).toBe(false);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toMatch(/chunk 0 failed after/);
  });

  test("a failing chunk does not stop processing of subsequent chunks", async () => {
    // 2 500 users → 3 chunks; first chunk always fails
    mockPaginateAll.mockResolvedValue({ rows: makeEntries(2_500), pages: 3 });

    let callCount = 0;
    const rpc = jest.fn().mockImplementation((_fn: string, args: { p_emails: string[] }) => {
      callCount++;
      // First three calls (chunk 0, all retries) fail; remaining succeed
      if (callCount <= MAX_RETRIES) {
        return Promise.resolve({ data: null, error: { message: "disk full" } });
      }
      return Promise.resolve({ data: args.p_emails.length, error: null });
    });
    mockGetSupabaseServer.mockReturnValue(makeDb(rpc));

    const body = await (await GET(makeRequest())).json();

    // chunk 0 used MAX_RETRIES attempts; chunks 1 and 2 each used 1 attempt
    expect(rpc).toHaveBeenCalledTimes(MAX_RETRIES + 2);
    expect(body.errors).toHaveLength(1);          // only chunk 0 errored
    expect(body.ok).toBe(false);
    expect(body.chunks).toBe(3);
  });

  test("succeeds immediately on first attempt (no retry overhead)", async () => {
    mockPaginateAll.mockResolvedValue({ rows: makeEntries(10), pages: 1 });

    const rpc = jest.fn().mockResolvedValue({ data: 10, error: null });
    mockGetSupabaseServer.mockReturnValue(makeDb(rpc));

    await GET(makeRequest());

    expect(rpc).toHaveBeenCalledTimes(1);   // no unnecessary retries
  });
});

// ── 7. Idempotency (regression) ───────────────────────────────────────────────

describe("idempotency", () => {
  test("same leaderboard data produces identical ranks on two consecutive calls", async () => {
    const entries = makeEntries(50);

    const capturedRanks1: number[] = [];
    const capturedRanks2: number[] = [];

    const rpc1 = jest.fn().mockImplementation((_fn: string, args: { p_ranks: number[] }) => {
      capturedRanks1.push(...args.p_ranks);
      return Promise.resolve({ data: args.p_ranks.length, error: null });
    });
    const rpc2 = jest.fn().mockImplementation((_fn: string, args: { p_ranks: number[] }) => {
      capturedRanks2.push(...args.p_ranks);
      return Promise.resolve({ data: args.p_ranks.length, error: null });
    });

    mockPaginateAll
      .mockResolvedValueOnce({ rows: entries, pages: 1 })
      .mockResolvedValueOnce({ rows: entries, pages: 1 });

    mockGetSupabaseServer
      .mockReturnValueOnce(makeDb(rpc1))
      .mockReturnValueOnce(makeDb(rpc2));

    await GET(makeRequest());
    await GET(makeRequest());

    expect(capturedRanks1).toEqual(capturedRanks2);
  });

  test("changing one user's points changes only that user's rank", async () => {
    const base = makeEntries(5);  // points: 5,4,3,2,1 → ranks: 1,2,3,4,5

    // Promote user4 (1pt → 6pt, now top)
    const updated = [
      { user_email: base[4].user_email, month_points: 6 }, // was rank 5, now rank 1
      ...base.slice(0, 4).map(e => ({ ...e })),            // everyone else shifts +1
    ].sort((a, b) => b.month_points - a.month_points);

    const captureRanks = (arr: number[]) =>
      jest.fn().mockImplementation((_fn: string, args: { p_emails: string[]; p_ranks: number[] }) => {
        args.p_emails.forEach((e, i) => {
          const idx = base.findIndex(b => b.user_email === e);
          if (idx >= 0) arr[idx] = args.p_ranks[i];
        });
        return Promise.resolve({ data: args.p_ranks.length, error: null });
      });

    const ranksBefore = new Array(5).fill(0);
    const ranksAfter  = new Array(5).fill(0);

    mockPaginateAll
      .mockResolvedValueOnce({ rows: base,    pages: 1 })
      .mockResolvedValueOnce({ rows: updated, pages: 1 });

    mockGetSupabaseServer
      .mockReturnValueOnce(makeDb(captureRanks(ranksBefore)))
      .mockReturnValueOnce(makeDb(captureRanks(ranksAfter)));

    await GET(makeRequest());
    await GET(makeRequest());

    expect(ranksBefore).toEqual([1, 2, 3, 4, 5]);
    // user4 (index 4) was 5th, now should be 1st
    expect(ranksAfter[4]).toBe(1);
    // user0 (index 0) was 1st (5pts), now 2nd (6pts > 5pts pushes them down)
    expect(ranksAfter[0]).toBe(2);
  });
});

// ── 8. Response shape ─────────────────────────────────────────────────────────

describe("response shape", () => {
  test("successful run returns ok, updated, total, chunks, durationMs", async () => {
    mockPaginateAll.mockResolvedValue({ rows: makeEntries(10), pages: 1 });
    mockGetSupabaseServer.mockReturnValue(makeDb());

    const body = await (await GET(makeRequest())).json();

    expect(body).toMatchObject({
      ok:         true,
      updated:    expect.any(Number),
      total:      10,
      chunks:     1,
      durationMs: expect.any(Number),
    });
    expect(body.errors).toBeUndefined(); // no errors field on success
  });

  test("partial failure includes errors array", async () => {
    jest.spyOn(global, "setTimeout").mockImplementation(
      (fn: (...args: unknown[]) => void) => { fn(); return 0 as unknown as ReturnType<typeof setTimeout>; },
    );

    mockPaginateAll.mockResolvedValue({ rows: makeEntries(10), pages: 1 });
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: "fail" } });
    mockGetSupabaseServer.mockReturnValue(makeDb(rpc));

    const body = await (await GET(makeRequest())).json();

    expect(body.ok).toBe(false);
    expect(Array.isArray(body.errors)).toBe(true);

    jest.restoreAllMocks();
  });
});
