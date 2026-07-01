process.env.COACH_TOKEN_SECRET       = "test-secret";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
// Mock cache so tests don't need Redis — also lets us assert cache is invalidated
jest.mock("@/lib/cache", () => ({
  cacheDel: jest.fn().mockResolvedValue(undefined),
  CK:       { leaderboard: (loc: unknown, friends: unknown) => `lb:v1:${loc ?? "_"}:${friends ?? "_"}` },
}));

import { recalculateMonth } from "@/lib/recalculate-leaderboard";
import { getSupabaseServer } from "@/lib/supabase-server";
import { cacheDel } from "@/lib/cache";

const mockCacheDel = cacheDel as jest.Mock;

const mockGetSupabaseServer = getSupabaseServer as jest.Mock;

// ── DB mock factory ───────────────────────────────────────────────────────────

interface AttRow {
  id:           number;
  session_id:   string;
  user_email:   string;
  attended:     boolean;
  bonus_points: number;
}
interface UserRow {
  email:      string;
  first_name: string;
  last_name:  string;
  location:   string;
  goal:       string;
}
interface LbRow {
  user_email:      string;
  month_points:    number;
  total_points:    number;
  points_month:    string;
  month_runs?:     number;
  month_km?:       number;
  month_time_secs?: number;
  total_runs?:     number;
  total_km?:       number;
  total_time_secs?: number;
}

function makeDb(opts: {
  sessions:             { id: string; date: string; location: string }[];
  attendance:           AttRow[];
  users:                UserRow[];
  existingLeaderboard?: LbRow[];
}) {
  const upsertMock = jest.fn().mockResolvedValue({ error: null });
  const attUpdateInMock = jest.fn().mockResolvedValue({ error: null });

  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "sessions") {
        const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
        chain.select = jest.fn().mockReturnValue(chain);
        chain.gte    = jest.fn().mockReturnValue(chain);
        chain.lte    = jest.fn().mockReturnValue(chain);
        chain.order  = jest.fn().mockResolvedValue({ data: opts.sessions, error: null });
        return chain;
      }

      if (table === "session_attendance") {
        const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
        chain.select = jest.fn().mockReturnValue(chain);
        chain.in     = jest.fn().mockResolvedValue({ data: opts.attendance, error: null });
        chain.update = jest.fn().mockReturnValue({ in: attUpdateInMock });
        return chain;
      }

      if (table === "users") {
        const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
        chain.select = jest.fn().mockReturnValue(chain);
        chain.in     = jest.fn().mockResolvedValue({ data: opts.users, error: null });
        return chain;
      }

      if (table === "leaderboard") {
        // The leaderboard table is queried twice:
        //   1. Debounce check: .select().eq().gte().limit()  → always returns [] (no skip)
        //   2. Existing data:  .select().in()               → returns existingLeaderboard
        const lbChain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
        lbChain.select = jest.fn().mockReturnValue(lbChain);
        lbChain.eq     = jest.fn().mockReturnValue(lbChain);
        lbChain.gte    = jest.fn().mockReturnValue(lbChain);
        lbChain.limit  = jest.fn().mockResolvedValue({ data: [], error: null }); // debounce: no recent
        lbChain.in     = jest.fn().mockResolvedValue({ data: opts.existingLeaderboard ?? [], error: null });
        return { ...lbChain, upsert: upsertMock };
      }

      return {};
    }),
    _upsertMock:       upsertMock,
    _attUpdateInMock:  attUpdateInMock,
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSIONS = [{ id: "s1", date: "2026-06-07", location: "Hyd" }];
const USERS    = [
  { email: "a@x.com", first_name: "Alice", last_name: "A", location: "Hyd", goal: "5k"  },
  { email: "b@x.com", first_name: "Bob",   last_name: "B", location: "Hyd", goal: "10k" },
];

beforeEach(() => jest.clearAllMocks());

describe("recalculateMonth", () => {

  test("single batch upsert replaces N sequential updates", async () => {
    const db = makeDb({
      sessions:   SESSIONS,
      attendance: [
        { id: 1, session_id: "s1", user_email: "a@x.com", attended: true,  bonus_points: 0 },
        { id: 2, session_id: "s1", user_email: "b@x.com", attended: true,  bonus_points: 0 },
      ],
      users: USERS,
    });
    mockGetSupabaseServer.mockReturnValue(db);

    const result = await recalculateMonth("2026-06");

    expect(result.updated).toBe(2);
    // One upsert call for both users — not two separate update calls
    expect(db._upsertMock).toHaveBeenCalledTimes(1);
    const rows = db._upsertMock.mock.calls[0][0] as { user_email: string }[];
    expect(rows).toHaveLength(2);
  });

  test("base score: 5 pts per attended session + bonus_points", async () => {
    const db = makeDb({
      sessions:   SESSIONS,
      attendance: [
        { id: 1, session_id: "s1", user_email: "a@x.com", attended: true,  bonus_points: 3 },
        { id: 2, session_id: "s1", user_email: "b@x.com", attended: false, bonus_points: 0 },
      ],
      users: USERS,
    });
    mockGetSupabaseServer.mockReturnValue(db);

    await recalculateMonth("2026-06");

    const rows = db._upsertMock.mock.calls[0][0] as { user_email: string; month_points: number }[];
    const alice = rows.find(r => r.user_email === "a@x.com");
    const bob   = rows.find(r => r.user_email === "b@x.com");
    expect(alice?.month_points).toBe(8);  // 5 base + 3 bonus
    expect(bob?.month_points).toBe(0);    // attended = false
  });

  test("total_points accumulates correctly across months", async () => {
    const db = makeDb({
      sessions:   SESSIONS,
      attendance: [{ id: 1, session_id: "s1", user_email: "a@x.com", attended: true, bonus_points: 0 }],
      users:      [USERS[0]],
      existingLeaderboard: [{
        user_email:   "a@x.com",
        month_points: 10,        // previous June points (to be replaced)
        total_points: 60,        // includes all-time
        points_month: "2026-06",
        month_runs:   5, month_km: 25, month_time_secs: 7200,
        total_runs:   20, total_km: 100, total_time_secs: 28800,
      }],
    });
    mockGetSupabaseServer.mockReturnValue(db);

    await recalculateMonth("2026-06");

    const rows = db._upsertMock.mock.calls[0][0] as { user_email: string; month_points: number; total_points: number }[];
    const alice = rows.find(r => r.user_email === "a@x.com")!;
    expect(alice.month_points).toBe(5);               // 1 session × 5 pts
    expect(alice.total_points).toBe(60 - 10 + 5);    // old_total - old_month + new_month = 55
  });

  test("preserves run/km data on update — does not zero it out", async () => {
    const db = makeDb({
      sessions:   SESSIONS,
      attendance: [{ id: 1, session_id: "s1", user_email: "a@x.com", attended: true, bonus_points: 0 }],
      users:      [USERS[0]],
      existingLeaderboard: [{
        user_email:      "a@x.com",
        month_points:    0, total_points: 50, points_month: "2026-05",
        month_runs:      12, month_km: 60, month_time_secs: 18000,
        total_runs:      40, total_km: 200, total_time_secs: 72000,
      }],
    });
    mockGetSupabaseServer.mockReturnValue(db);

    await recalculateMonth("2026-06");

    const rows = db._upsertMock.mock.calls[0][0] as {
      user_email: string; total_runs: number; total_km: number;
    }[];
    const alice = rows.find(r => r.user_email === "a@x.com")!;
    expect(alice.total_runs).toBe(40);
    expect(alice.total_km).toBe(200);
  });

  test("marks all month attendance as synced in a single batch call", async () => {
    const db = makeDb({
      sessions:   SESSIONS,
      attendance: [
        { id: 1, session_id: "s1", user_email: "a@x.com", attended: true, bonus_points: 0 },
        { id: 2, session_id: "s1", user_email: "b@x.com", attended: true, bonus_points: 0 },
      ],
      users: USERS,
    });
    mockGetSupabaseServer.mockReturnValue(db);

    await recalculateMonth("2026-06");

    // One batch update call (not two per-user calls)
    expect(db._attUpdateInMock).toHaveBeenCalledTimes(1);
    expect(db._attUpdateInMock).toHaveBeenCalledWith("id", [1, 2]);
  });

  test("idempotent: same inputs produce the same upsert payload on repeated calls", async () => {
    const data = {
      sessions:   SESSIONS,
      attendance: [{ id: 1, session_id: "s1", user_email: "a@x.com", attended: true, bonus_points: 0 }],
      users:      [USERS[0]],
    };

    const db1 = makeDb(data);
    const db2 = makeDb(data);
    mockGetSupabaseServer
      .mockReturnValueOnce(db1)
      .mockReturnValueOnce(db2);

    await recalculateMonth("2026-06");
    await recalculateMonth("2026-06");

    const rows1 = db1._upsertMock.mock.calls[0][0] as { month_points: number }[];
    const rows2 = db2._upsertMock.mock.calls[0][0] as { month_points: number }[];
    expect(rows1[0].month_points).toBe(rows2[0].month_points);
  });

  test("returns early when no sessions exist in the month", async () => {
    const db = makeDb({ sessions: [], attendance: [], users: [] });
    mockGetSupabaseServer.mockReturnValue(db);

    const result = await recalculateMonth("2026-06");

    expect(result.updated).toBe(0);
    expect(db._upsertMock).not.toHaveBeenCalled();
  });

  // ── IST timezone: todayIST() upper bound ───────────────────────────────────

  describe("IST timezone boundary for session upper bound", () => {

    test("includes IST-same-day sessions even when UTC is still the previous day", async () => {
      // IST: 2026-06-08 01:30 (early morning) = UTC: 2026-06-07 20:00
      // Without the IST fix, `today` (UTC) would be "2026-06-07", excluding
      // the 2026-06-08 session that already ran in IST time.
      // With the fix, `today` (IST) = "2026-06-08", so it IS included.
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-06-07T20:00:00Z")); // IST: 2026-06-08 01:30

      const db = makeDb({
        sessions:   [{ id: "s1", date: "2026-06-08", location: "Hyd" }],
        attendance: [{ id: 1, session_id: "s1", user_email: "a@x.com", attended: true, bonus_points: 0 }],
        users:      [USERS[0]],
      });
      mockGetSupabaseServer.mockReturnValue(db);

      const result = await recalculateMonth("2026-06");

      // The session on "2026-06-08" must be included (IST today is 2026-06-08)
      // so Alice should have earned 5 points.
      expect(result.updated).toBe(1);
      const rows = db._upsertMock.mock.calls[0][0] as { month_points: number }[];
      expect(rows[0].month_points).toBe(5);

      jest.useRealTimers();
    });

    test("excludes sessions strictly in the future (IST)", async () => {
      // IST: 2026-06-07 10:00 (morning) = UTC: 2026-06-07 04:30
      // Session dated 2026-06-08 is tomorrow in IST, should be excluded by the
      // `lte("date", today)` filter. We check that `today` is NOT in the future.
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-06-07T04:30:00Z")); // IST: 2026-06-07 10:00

      // The DB mock uses the date range filter in the real `sessions` query.
      // We verify the sessions query was called with a `lte` date of "2026-06-07"
      // (IST today), not "2026-06-08".
      const db = makeDb({
        sessions:   [],   // simulate: DB returned no sessions (filtered out future)
        attendance: [],
        users:      [],
      });
      mockGetSupabaseServer.mockReturnValue(db);

      // Extract the `lte` value passed to the sessions query
      const lteCapture = jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
      });
      db.from = jest.fn().mockImplementation((table: string) => {
        if (table === "sessions") {
          return {
            select: jest.fn().mockReturnThis(),
            gte:    jest.fn().mockReturnThis(),
            lte:    lteCapture,
            order:  jest.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        // leaderboard debounce
        const lbChain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
        lbChain.select = jest.fn().mockReturnValue(lbChain);
        lbChain.eq     = jest.fn().mockReturnValue(lbChain);
        lbChain.gte    = jest.fn().mockReturnValue(lbChain);
        lbChain.limit  = jest.fn().mockResolvedValue({ data: [], error: null });
        lbChain.in     = jest.fn().mockResolvedValue({ data: [], error: null });
        return { ...lbChain, upsert: jest.fn() };
      });

      await recalculateMonth("2026-06");

      // The lte value passed should be "2026-06-07" (IST today), not a future date
      const lteArg = lteCapture.mock.calls[0]?.[1] as string;
      expect(lteArg).toBe("2026-06-07");

      jest.useRealTimers();
    });
  });

  // ── Cache invalidation ─────────────────────────────────────────────────────

  describe("cache invalidation after upsert", () => {

    test("calls cacheDel with the base leaderboard key after a successful update", async () => {
      const db = makeDb({
        sessions:   SESSIONS,
        attendance: [{ id: 1, session_id: "s1", user_email: "a@x.com", attended: true, bonus_points: 0 }],
        users:      [USERS[0]],
      });
      mockGetSupabaseServer.mockReturnValue(db);
      mockCacheDel.mockClear();

      await recalculateMonth("2026-06");

      expect(mockCacheDel).toHaveBeenCalledTimes(1);
      expect(mockCacheDel).toHaveBeenCalledWith("lb:v1:_:_");
    });

    test("does NOT call cacheDel when there are no sessions (early return)", async () => {
      const db = makeDb({ sessions: [], attendance: [], users: [] });
      mockGetSupabaseServer.mockReturnValue(db);
      mockCacheDel.mockClear();

      await recalculateMonth("2026-06");

      expect(mockCacheDel).not.toHaveBeenCalled();
    });

    test("does NOT call cacheDel when no attendance records found (early return)", async () => {
      const db = makeDb({
        sessions:   SESSIONS,
        attendance: [],
        users:      [],
      });
      mockGetSupabaseServer.mockReturnValue(db);
      mockCacheDel.mockClear();

      await recalculateMonth("2026-06");

      expect(mockCacheDel).not.toHaveBeenCalled();
    });
  });

  // ── User not in users table must still be processed ────────────────────────

  describe("graceful handling when user email is absent from the users table", () => {

    test("user with no users-table row is included using existing leaderboard name", async () => {
      // "ghost@x.com" exists in session_attendance and leaderboard but NOT in users table.
      // After the fix this user must still be upserted with correct month_points.
      const db = makeDb({
        sessions:   SESSIONS,
        attendance: [{ id: 1, session_id: "s1", user_email: "ghost@x.com", attended: true, bonus_points: 0 }],
        users:      [],   // ← ghost not here
        existingLeaderboard: [{
          user_email:   "ghost@x.com",
          user_name:    "Ghost User",  // ← name preserved from LB row
          month_points: 0,
          total_points: 10,
          points_month: "2026-05",
        }],
      });
      mockGetSupabaseServer.mockReturnValue(db);

      const result = await recalculateMonth("2026-06");

      expect(result.updated).toBe(1);
      const rows = db._upsertMock.mock.calls[0][0] as { user_email: string; month_points: number; user_name: string }[];
      const ghost = rows.find(r => r.user_email === "ghost@x.com");
      expect(ghost).toBeDefined();
      expect(ghost?.month_points).toBe(5);    // earned 5 pts
      expect(ghost?.user_name).toBe("Ghost User");  // name from existing LB row
    });

    test("user with no users-table row AND no existing LB row gets email prefix as name", async () => {
      const db = makeDb({
        sessions:   SESSIONS,
        attendance: [{ id: 1, session_id: "s1", user_email: "new@example.com", attended: true, bonus_points: 0 }],
        users:      [],
        existingLeaderboard: [],
      });
      mockGetSupabaseServer.mockReturnValue(db);

      const result = await recalculateMonth("2026-06");

      expect(result.updated).toBe(1);
      const rows = db._upsertMock.mock.calls[0][0] as { user_email: string; user_name: string }[];
      const entry = rows.find(r => r.user_email === "new@example.com");
      expect(entry?.user_name).toBe("new");  // email prefix fallback
    });

    test("case-insensitive email matching resolves users table lookup correctly", async () => {
      // session_attendance stores "Alice@X.COM" (mixed case)
      // users table stores "alice@x.com" (lowercase) — same email, different case
      // Before the fix: userMap.get("Alice@X.COM") → undefined → user skipped
      // After the fix:  userMap is keyed by lowercase, lookup is also lowercase → found
      const db = makeDb({
        sessions:   SESSIONS,
        attendance: [{ id: 1, session_id: "s1", user_email: "Alice@x.com", attended: true, bonus_points: 0 }],
        users:      [{ ...USERS[0], email: "alice@x.com" }],
        existingLeaderboard: [],
      });
      mockGetSupabaseServer.mockReturnValue(db);

      await recalculateMonth("2026-06");

      const rows = db._upsertMock.mock.calls[0][0] as { user_email: string; user_name: string; month_points: number }[];
      // The attendance email is preserved as the upsert key
      const alice = rows.find(r => r.user_email === "Alice@x.com");
      expect(alice?.month_points).toBe(5);
      // Name comes from the users table (matched case-insensitively)
      expect(alice?.user_name).toBe("Alice A");
    });
  });
});

// ── force flag: bypass 60-second debounce ─────────────────────────────────────

describe("force flag bypasses debounce", () => {

  function makeDbWithRecentRow(sessionDate: string, attendance: AttRow[], users: UserRow[]) {
    const upsertMock       = jest.fn().mockResolvedValue({ error: null });
    const attUpdateInMock  = jest.fn().mockResolvedValue({ error: null });

    return {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "sessions") {
          const c: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
          c.select = jest.fn().mockReturnValue(c);
          c.gte    = jest.fn().mockReturnValue(c);
          c.lte    = jest.fn().mockReturnValue(c);
          c.order  = jest.fn().mockResolvedValue({ data: [{ id: "s1", date: sessionDate, location: "Hyd" }], error: null });
          return c;
        }
        if (table === "session_attendance") {
          const c: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
          c.select = jest.fn().mockReturnValue(c);
          c.in     = jest.fn().mockResolvedValue({ data: attendance, error: null });
          c.update = jest.fn().mockReturnValue({ in: attUpdateInMock });
          return c;
        }
        if (table === "users") {
          const c: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
          c.select = jest.fn().mockReturnValue(c);
          c.in     = jest.fn().mockResolvedValue({ data: users, error: null });
          return c;
        }
        if (table === "leaderboard") {
          const lbChain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
          lbChain.select = jest.fn().mockReturnValue(lbChain);
          lbChain.eq     = jest.fn().mockReturnValue(lbChain);
          lbChain.gte    = jest.fn().mockReturnValue(lbChain);
          // Debounce check returns a RECENT row → would normally skip
          lbChain.limit  = jest.fn().mockResolvedValue({ data: [{ updated_at: new Date().toISOString() }], error: null });
          lbChain.in     = jest.fn().mockResolvedValue({ data: [], error: null });
          return { ...lbChain, upsert: upsertMock };
        }
        return {};
      }),
      _upsertMock:      upsertMock,
      _attUpdateInMock: attUpdateInMock,
    };
  }

  test("without force: skips when debounce row is recent", async () => {
    const db = makeDbWithRecentRow("2026-06-07", [], []);
    mockGetSupabaseServer.mockReturnValue(db);

    const result = await recalculateMonth("2026-06");

    expect(result.updated).toBe(0);
    expect(result.message).toMatch(/skipped/i);
    expect(db._upsertMock).not.toHaveBeenCalled();
  });

  test("with force: runs even when debounce row is recent", async () => {
    const db = makeDbWithRecentRow("2026-06-07", [
      { id: 1, session_id: "s1", user_email: "a@x.com", attended: true, bonus_points: 0 },
    ], [USERS[0]]);
    mockGetSupabaseServer.mockReturnValue(db);

    const result = await recalculateMonth("2026-06", { force: true });

    expect(result.updated).toBe(1);
    expect(db._upsertMock).toHaveBeenCalledTimes(1);
  });
});

// ── Scoring consistency: week_points formula must match recalculateMonth ───────
// The public API computes week_points as `5 + (bonus_points ?? 0)`.
// recalculateMonth computes basePoints as `5 + (bonus_points ?? 0)`.
// Both MUST produce the same number for the same session row.

describe("scoring formula consistency (week vs month)", () => {

  const SCORING_CASES: { bonusPoints: number; expectedPts: number }[] = [
    { bonusPoints: 0,  expectedPts: 5  },   // plain attendance, no bonus
    { bonusPoints: 5,  expectedPts: 10 },   // 5 extra bonus pts on top of base 5
    { bonusPoints: 10, expectedPts: 15 },   // 10 extra bonus pts
    { bonusPoints: 3,  expectedPts: 8  },   // 3 extra bonus pts
  ];

  test.each(SCORING_CASES)(
    "bonus_points=$bonusPoints → month_points=$expectedPts (same as week formula 5+bonus)",
    async ({ bonusPoints, expectedPts }) => {
      const db = makeDb({
        sessions:   SESSIONS,
        attendance: [{ id: 1, session_id: "s1", user_email: "a@x.com", attended: true, bonus_points: bonusPoints }],
        users:      [USERS[0]],
      });
      mockGetSupabaseServer.mockReturnValue(db);

      await recalculateMonth("2026-06");

      const rows = db._upsertMock.mock.calls[0][0] as { month_points: number }[];
      expect(rows[0].month_points).toBe(expectedPts);
      // This value should equal what the week_points formula `5 + bonus` produces:
      expect(5 + bonusPoints).toBe(expectedPts);
    }
  );
});
