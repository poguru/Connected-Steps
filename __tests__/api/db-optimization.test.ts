// Regression tests for database optimization changes.
//
// Covers:
//  1. Admin attendance — bonus points use batch ops (1 DELETE + 1 INSERT, not N of each)
//  2. Admin attendance — response shape unchanged after batch fix
//  3. Admin attendance — users with no bonus points: no ledger ops
//  4. Admin attendance — already-synced users are still skipped
//  5. Achievements — badge inserts are batched (1 INSERT, not N sequential)
//  6. Achievements — response shape unchanged after batch fix
//  7. Admin sessions — no pagination params → { data } (backward compat)
//  8. Admin sessions — with pagination params → { data, page, limit, hasMore }
//  9. Admin sessions — range() called correctly for page > 0
// 10. Admin events  — no pagination params → { data } (backward compat)
// 11. Admin events  — with pagination params → { data, page, limit, hasMore }
// 12. Slug generation — no DB queries during event creation
// 13. Slug generation — two events with same title get different slugs

process.env.ADMIN_PASSWORD            = "test-admin";
process.env.COACH_TOKEN_SECRET        = "test-coach-secret";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server",  () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth",       () => ({
  isAdminOrCoach:  jest.fn().mockResolvedValue(true),
  verifyUserToken: jest.fn().mockReturnValue("admin@cs.test"),
}));
jest.mock("@/lib/notify-inapp",     () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auto-feed",        () => ({
  autoFeedSessionCompleted: jest.fn().mockResolvedValue(undefined),
  autoFeedBadgeEarned:      jest.fn().mockResolvedValue(undefined),
}));

import { NextRequest }           from "next/server";
import { getSupabaseServer }     from "@/lib/supabase-server";

const mockGetSupabaseServer = getSupabaseServer as jest.Mock;

// ── Supabase mock builders ─────────────────────────────────────────────────────

/** Attendance route mock — tracks points_ledger DELETE and INSERT calls. */
function makeAttendanceDb(opts: {
  existingAttendance?: { user_email: string; attended: boolean; points_synced: boolean }[];
  sessionTitle?: string;
} = {}) {
  const deleteMock  = jest.fn().mockReturnThis();
  const eqDeleteMock = jest.fn().mockReturnThis();
  const inDeleteMock = jest.fn().mockResolvedValue({ error: null });
  const insertMock  = jest.fn().mockResolvedValue({ error: null });
  const upsertMock  = jest.fn().mockResolvedValue({ error: null });

  const db = {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "sessions") {
        return {
          select: jest.fn().mockReturnThis(),
          eq:     jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: "sess-1", title: opts.sessionTitle ?? "Morning Run", date: "2026-06-26" },
            error: null,
          }),
        };
      }
      if (table === "session_attendance") {
        return {
          select: jest.fn().mockReturnThis(),
          eq:     jest.fn().mockResolvedValue({
            data:  opts.existingAttendance ?? [],
            error: null,
          }),
          upsert: upsertMock,
        };
      }
      if (table === "points_ledger") {
        return {
          delete: () => ({
            eq: () => ({
              eq: () => ({
                in: inDeleteMock,
              }),
            }),
          }),
          insert: insertMock,
        };
      }
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
    }),
    _upsertMock:   upsertMock,
    _insertMock:   insertMock,
    _inDeleteMock: inDeleteMock,
  };
  return db;
}

/** Admin sessions/events route mock. */
function makeListDb(rows: unknown[], tableName: string) {
  const rangeMock = jest.fn().mockResolvedValue({ data: rows.slice(0, 10), error: null });
  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === tableName) {
        return {
          select: jest.fn().mockReturnThis(),
          order:  jest.fn().mockImplementation(() => ({
            range:  rangeMock,
            // Mimics resolving directly when no .range() is called
            then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
              Promise.resolve({ data: rows, error: null }).then(resolve),
          })),
        };
      }
      return {};
    }),
    _rangeMock: rangeMock,
  };
}

function makeRequest(url: string, method = "GET", body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "x-admin-password": "test-admin", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => jest.clearAllMocks());

// ── 1–4: Admin attendance bonus-points batch ops ──────────────────────────────

describe("admin attendance — bonus points batch operations", () => {
  async function runPost(users: { email: string; name: string; attended: boolean; bonus_points: number; bonus_reason: string }[]) {
    const { POST } = await import("@/app/api/admin/sessions/[id]/attendance/route");
    const db = makeAttendanceDb({ existingAttendance: [] });
    mockGetSupabaseServer.mockReturnValue(db);
    const req = makeRequest("http://localhost/api/admin/sessions/sess-1/attendance", "POST", { users });
    return { res: await POST(req, { params: Promise.resolve({ id: "sess-1" }) }), db };
  }

  test("3 bonus users → exactly 1 batch DELETE and 1 batch INSERT (not 3 of each)", async () => {
    const { res, db } = await runPost([
      { email: "a@cs.test", name: "Alice", attended: true, bonus_points: 5,  bonus_reason: "Pacer" },
      { email: "b@cs.test", name: "Bob",   attended: true, bonus_points: 10, bonus_reason: "Marshal" },
      { email: "c@cs.test", name: "Carol", attended: true, bonus_points: 3,  bonus_reason: "Volunteer" },
    ]);

    expect((await res.json()).success).toBe(true);

    // The batch DELETE is captured by inDeleteMock
    expect(db._inDeleteMock).toHaveBeenCalledTimes(1);
    const deletedEmails = db._inDeleteMock.mock.calls[0][1] as string[];
    expect(deletedEmails).toHaveLength(3);
    expect(deletedEmails).toContain("a@cs.test");

    // The batch INSERT is captured by insertMock
    expect(db._insertMock).toHaveBeenCalledTimes(1);
    const insertedRows = db._insertMock.mock.calls[0][0] as { user_email: string }[];
    expect(insertedRows).toHaveLength(3);
    expect(insertedRows.map(r => r.user_email)).toContain("c@cs.test");
  });

  test("response shape is unchanged: { success, saved, skipped }", async () => {
    const { res } = await runPost([
      { email: "a@cs.test", name: "Alice", attended: true, bonus_points: 5, bonus_reason: "Pacer" },
    ]);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, saved: expect.any(Number), skipped: expect.any(Number) });
  });

  test("users with 0 bonus_points trigger no ledger operations", async () => {
    const { db } = await runPost([
      { email: "a@cs.test", name: "Alice", attended: true, bonus_points: 0, bonus_reason: "" },
    ]);
    expect(db._inDeleteMock).not.toHaveBeenCalled();
    expect(db._insertMock).not.toHaveBeenCalled();
  });

  test("already-synced users are still skipped (no regression)", async () => {
    const { POST } = await import("@/app/api/admin/sessions/[id]/attendance/route");
    const db = makeAttendanceDb({
      existingAttendance: [
        { user_email: "synced@cs.test", attended: true, points_synced: true },
      ],
    });
    mockGetSupabaseServer.mockReturnValue(db);
    const req = makeRequest("http://localhost/api/admin/sessions/sess-1/attendance", "POST", {
      users: [
        { email: "synced@cs.test", name: "Already Synced", attended: true, bonus_points: 5, bonus_reason: "test" },
      ],
    });
    const res = await POST(req, { params: Promise.resolve({ id: "sess-1" }) });
    const body = await res.json();
    expect(body.skipped).toBe(1);  // synced user is in skippedEmails set
    expect(body.saved).toBe(0);
    expect(db._inDeleteMock).not.toHaveBeenCalled();  // no bonus ops on skipped user
  });
});

// ── 5–6: Achievements batch badge insert ──────────────────────────────────────

describe("achievements — batch badge insert", () => {
  function makeAchievementsDb(opts: {
    sessionCount?:  number;
    monthPoints?:   number;
    membershipActive?: boolean;
    storedBadges?:  string[];
  } = {}) {
    const { sessionCount = 10, monthPoints = 50, membershipActive = true, storedBadges = [] } = opts;

    const insertMock = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({
        data:  [],  // no newly inserted rows (already have badges in storedBadges)
        error: null,
      }),
    });

    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "session_attendance") {
          const chain = { select: jest.fn(), eq: jest.fn() };
          chain.select.mockReturnValue(chain);
          // Second .eq() resolves with the data; first .eq() returns the chain
          chain.eq.mockImplementation(() => ({
            ...chain,
            eq: jest.fn().mockResolvedValue({
              data: Array.from({ length: sessionCount }, (_, i) => ({ attended: true, id: i })),
              error: null,
            }),
            // Direct resolve if only one .eq() is chained (shouldn't happen for this query)
            then: (resolve: (v: unknown) => void) =>
              Promise.resolve({ data: Array.from({ length: sessionCount }, (_, i) => ({ attended: true, id: i })), error: null }).then(resolve),
          }));
          return chain;
        }
        if (table === "leaderboard") {
          let callCount = 0;
          return {
            select: jest.fn().mockImplementation((cols: string, opts?: { count: string; head: boolean }) => {
              callCount++;
              if (opts?.count === "exact") {
                // rank count query
                return { gt: jest.fn().mockResolvedValue({ count: 5, error: null }) };
              }
              return { eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { month_points: monthPoints }, error: null }) };
            }),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { month_points: monthPoints }, error: null }),
          };
        }
        if (table === "memberships") {
          const expiresAt = membershipActive ? new Date(Date.now() + 86400000).toISOString() : new Date(0).toISOString();
          return {
            select: jest.fn().mockReturnThis(),
            eq:     jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { status: "active", expires_at: expiresAt }, error: null }),
          };
        }
        if (table === "user_achievements") {
          return {
            select: jest.fn().mockReturnThis(),
            eq:     jest.fn().mockResolvedValue({
              data: storedBadges.map(id => ({ badge_id: id })),
              error: null,
            }),
            insert: insertMock,
          };
        }
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn() };
      }),
      _insertMock: insertMock,
    };
    return db;
  }

  test("response shape is unchanged: { sessionCount, leaderboardRank, hasMembership }", async () => {
    const { GET } = await import("@/app/api/user/achievements/route");
    mockGetSupabaseServer.mockReturnValue(makeAchievementsDb({
      sessionCount: 5, storedBadges: ["first_session", "five_sessions"],
    }));
    const req = new NextRequest("http://localhost/api/user/achievements", {
      headers: { "x-user-token": "valid-token" },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body).toMatchObject({
      sessionCount:    expect.any(Number),
      leaderboardRank: expect.any(Number),
      hasMembership:   expect.any(Boolean),
    });
  });

  test("when new badges unlock, exactly 1 batch INSERT is made (not N sequential)", async () => {
    const { GET } = await import("@/app/api/user/achievements/route");
    // User has 10 sessions — qualifies for first_session, five_sessions, ten_sessions
    // but storedBadges is empty so all 3 will be unlocked
    const db = makeAchievementsDb({ sessionCount: 10, storedBadges: [] });
    mockGetSupabaseServer.mockReturnValue(db);

    const req = new NextRequest("http://localhost/api/user/achievements", {
      headers: { "x-user-token": "valid-token" },
    });
    await GET(req);

    // Allow the fire-and-forget persist() to run
    await new Promise(r => setTimeout(r, 10));

    // persist() should call insert exactly once with all badges, not once per badge
    expect(db._insertMock).toHaveBeenCalledTimes(1);
    const insertArg = db._insertMock.mock.calls[0][0] as { badge_id: string }[];
    expect(Array.isArray(insertArg)).toBe(true);
    expect(insertArg.length).toBeGreaterThan(1);  // multiple badges in one call
  });
});

// ── 7–9: Admin sessions pagination ────────────────────────────────────────────

describe("admin sessions — pagination", () => {
  test("no params → backward-compatible { data } shape, no .range() call", async () => {
    const { GET } = await import("@/app/api/admin/sessions/route");
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, date: "2026-06-01" }));
    const db   = makeListDb(rows, "sessions");
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await GET(makeRequest("http://localhost/api/admin/sessions"));
    const body = await res.json();

    expect(body).toHaveProperty("data");
    expect(body).not.toHaveProperty("page");
    expect(body).not.toHaveProperty("limit");
    expect(db._rangeMock).not.toHaveBeenCalled();
  });

  test("with ?page=0&limit=10 → { data, page, limit, hasMore }", async () => {
    const { GET } = await import("@/app/api/admin/sessions/route");
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, date: "2026-06-01" }));
    const db   = makeListDb(rows, "sessions");
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await GET(makeRequest("http://localhost/api/admin/sessions?page=0&limit=10"));
    const body = await res.json();

    expect(body).toMatchObject({ data: expect.any(Array), page: 0, limit: 10, hasMore: expect.any(Boolean) });
    expect(db._rangeMock).toHaveBeenCalledWith(0, 9);
  });

  test("page=2&limit=10 → range starts at offset 20", async () => {
    const { GET } = await import("@/app/api/admin/sessions/route");
    const db = makeListDb([], "sessions");
    mockGetSupabaseServer.mockReturnValue(db);

    await GET(makeRequest("http://localhost/api/admin/sessions?page=2&limit=10"));
    expect(db._rangeMock).toHaveBeenCalledWith(20, 29);
  });

  test("hasMore=true when returned rows === limit", async () => {
    const { GET } = await import("@/app/api/admin/sessions/route");
    const tenRows = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}` }));
    const db      = makeListDb(tenRows, "sessions");
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await GET(makeRequest("http://localhost/api/admin/sessions?page=0&limit=10"));
    const body = await res.json();
    expect(body.hasMore).toBe(true);
  });

  test("hasMore=false when returned rows < limit", async () => {
    const { GET } = await import("@/app/api/admin/sessions/route");
    const fiveRows = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}` }));
    const db       = makeListDb(fiveRows, "sessions");

    // Override range mock to return only 5 rows
    db._rangeMock.mockResolvedValue({ data: fiveRows, error: null });
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await GET(makeRequest("http://localhost/api/admin/sessions?page=0&limit=10"));
    const body = await res.json();
    expect(body.hasMore).toBe(false);
  });
});

// ── 10–11: Admin events pagination ────────────────────────────────────────────

describe("admin events — pagination", () => {
  test("no params → { data } backward-compat shape", async () => {
    const { GET } = await import("@/app/api/admin/events/route");
    const db = makeListDb([{ id: "e1" }, { id: "e2" }], "events");
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await GET(makeRequest("http://localhost/api/admin/events"));
    const body = await res.json();

    expect(body).toHaveProperty("data");
    expect(body).not.toHaveProperty("page");
    expect(db._rangeMock).not.toHaveBeenCalled();
  });

  test("with ?limit=5&page=1 → paginated shape + correct range", async () => {
    const { GET } = await import("@/app/api/admin/events/route");
    const db = makeListDb([], "events");
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await GET(makeRequest("http://localhost/api/admin/events?page=1&limit=5"));
    const body = await res.json();

    expect(body).toMatchObject({ data: expect.any(Array), page: 1, limit: 5, hasMore: expect.any(Boolean) });
    expect(db._rangeMock).toHaveBeenCalledWith(5, 9);  // page=1 × limit=5 = offset 5
  });
});

// ── 12–13: Slug generation (no DB queries) ────────────────────────────────────

describe("slug generation", () => {
  test("event creation does not query DB for slug uniqueness", async () => {
    const { POST } = await import("@/app/api/admin/events/route");

    const insertOneMock = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: "ev-1", share_slug: "five-k-run-xxx" }, error: null }),
    });

    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "events") return { insert: insertOneMock };
        return {};
      }),
    };
    mockGetSupabaseServer.mockReturnValue(db);

    const req = makeRequest("http://localhost/api/admin/events", "POST", {
      title: "Five K Run", location: "Hyderabad", start_date: "2026-07-01",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    // insert called exactly once (no slug-check queries before it)
    expect(insertOneMock).toHaveBeenCalledTimes(1);

    // DB was only called for the INSERT, never for a share_slug SELECT
    const allCalls = (db.from as jest.Mock).mock.calls;
    const slugCheckCalls = allCalls.filter(
      ([table]: [string]) => table === "events" && (db.from as jest.Mock).mock.results
    );
    // Only one from("events") call total (the INSERT) — no slug SELECT loops
    const eventTableCalls = allCalls.filter(([t]: [string]) => t === "events");
    expect(eventTableCalls).toHaveLength(1);
  });

  test("two events with the same title get different slugs", async () => {
    // Import the slug logic by calling POST twice with same title
    const { POST } = await import("@/app/api/admin/events/route");

    const slugs: string[] = [];
    const makeEventDb = () => ({
      from: jest.fn().mockReturnValue({
        insert: jest.fn().mockImplementation((data: { share_slug: string }) => {
          slugs.push(data.share_slug);
          return {
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: "ev", share_slug: data.share_slug }, error: null }),
          };
        }),
      }),
    });

    mockGetSupabaseServer.mockReturnValueOnce(makeEventDb()).mockReturnValueOnce(makeEventDb());

    const body = { title: "Morning Run", location: "Hyd", start_date: "2026-07-01" };
    await POST(makeRequest("http://localhost/api/admin/events", "POST", body));

    // Small pause to ensure Date.now() advances
    await new Promise(r => setTimeout(r, 2));

    await POST(makeRequest("http://localhost/api/admin/events", "POST", body));

    expect(slugs).toHaveLength(2);
    expect(slugs[0]).not.toBe(slugs[1]);  // unique slugs for same title
  });
});
