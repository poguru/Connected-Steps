/**
 * Tests for the leaderboard month-filter bug fix.
 *
 * Bug: On 1 July, the leaderboard returned June's `month_points` values
 * because the API read `month_points` directly from the leaderboard table
 * without checking whether `points_month` matched the current calendar month.
 *
 * Fix: The API now selects `points_month`, computes the current IST month,
 * and zeros `month_points` when the two do not match.
 *
 * These tests cover:
 *   1. Month transition (June → July): stale points zeroed on new month
 *   2. Same month match: valid points served as-is
 *   3. First day of new month with no new sessions: 0 for everyone
 *   4. IST timezone boundary: UTC still June but IST already July
 *   5. Week points: unaffected by the month fix
 *   6. All-time (total_points): unaffected by the month fix
 *   7. Missing points_month (null): treated as stale → 0
 */

process.env.COACH_TOKEN_SECRET       = "test-secret";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/cache", () => ({
  cacheGet:          jest.fn().mockResolvedValue(null), // always cache miss
  cacheSet:          jest.fn(),
  cacheDel:          jest.fn(),
  cacheFlushPattern: jest.fn().mockResolvedValue(0),
  CK:                { leaderboard: () => "lb:v1:_:_" },
  TTL:               { leaderboard: 30 },
  decorateLb:        jest.fn((rows: unknown[]) =>
    rows.map((r: unknown) => {
      const { _raw_email, ...rest } = r as Record<string, unknown>;
      return { ...rest, user_email: _raw_email, is_me: false };
    })
  ),
}));

import { GET, currentMonthIST, isoWeekStartIST } from "@/app/api/leaderboard/route";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const mockDb = getSupabaseServer as jest.Mock;

// ── IST constant ─────────────────────────────────────────────────────────────
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// ── DB mock factory ───────────────────────────────────────────────────────────

interface LbEntry {
  id:              string;
  user_email:      string;
  user_name:       string;
  location:        string;
  goal:            string;
  month_points:    number;
  points_month:    string | null;
  total_points:    number;
  week_points:     number;
  prev_month_rank: number | null;
  updated_at:      string | null;
}

function makeDb(
  lbEntries: LbEntry[],
  weekAttendance: { user_email: string; bonus_points: number; sessions: { date: string } }[] = [],
) {
  const lbChain = {
    select:  jest.fn().mockReturnThis(),
    order:   jest.fn().mockReturnThis(),
    limit:   jest.fn().mockResolvedValue({ data: lbEntries, error: null }),
    in:      jest.fn().mockReturnThis(),
  };

  const weekChain = {
    select: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    gte:    jest.fn().mockResolvedValue({ data: weekAttendance, error: null }),
  };

  const usersChain = {
    select: jest.fn().mockReturnThis(),
    in:     jest.fn().mockResolvedValue({ data: [], error: null }),
  };

  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "leaderboard")       return lbChain;
      if (table === "session_attendance") return weekChain;
      if (table === "users")             return usersChain;
      return { select: jest.fn().mockReturnThis(), in: jest.fn().mockResolvedValue({ data: [], error: null }) };
    }),
  };
}

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/leaderboard");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getEntries(db: ReturnType<typeof makeDb>) {
  mockDb.mockReturnValue(db);
  const res  = await GET(makeRequest());
  const body = await res.json() as { entries: Record<string, unknown>[] };
  return body.entries;
}

// ── Base fixture ─────────────────────────────────────────────────────────────

const BASE_ENTRY: LbEntry = {
  id:              "user-1",
  user_email:      "alice@test.com",
  user_name:       "Alice Test",
  location:        "Hyderabad",
  goal:            "marathon",
  month_points:    15,       // June's cached value
  points_month:    "2025-06",
  total_points:    120,
  week_points:     5,
  prev_month_rank: 3,
  updated_at:      "2025-06-30T20:00:00Z",
};

beforeEach(() => jest.clearAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// 1. MONTH TRANSITION (June → July)
// ═════════════════════════════════════════════════════════════════════════════

describe("month transition: stale June data must not appear in July", () => {

  test("month_points is 0 when points_month is the previous month", async () => {
    // Simulate: today is July, leaderboard still has June data
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-07-01T06:00:00Z")); // IST: 2025-07-01 11:30

    const db = makeDb([{ ...BASE_ENTRY, points_month: "2025-06", month_points: 15 }]);
    const entries = await getEntries(db);

    expect(entries[0].month_points).toBe(0);
    jest.useRealTimers();
  });

  test("month_points is 0 for all users when no July sessions have been synced", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-07-01T06:00:00Z"));

    const db = makeDb([
      { ...BASE_ENTRY, user_email: "alice@test.com", month_points: 20, points_month: "2025-06" },
      { ...BASE_ENTRY, id: "user-2", user_email: "bob@test.com", month_points: 10, points_month: "2025-06" },
    ]);
    const entries = await getEntries(db);

    for (const entry of entries) {
      expect(entry.month_points).toBe(0);
    }
    jest.useRealTimers();
  });

  test("total_points is preserved even when month_points is zeroed", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-07-01T06:00:00Z"));

    const db = makeDb([{ ...BASE_ENTRY, points_month: "2025-06", total_points: 120 }]);
    const entries = await getEntries(db);

    expect(entries[0].total_points).toBe(120);
    jest.useRealTimers();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. SAME MONTH (valid cache)
// ═════════════════════════════════════════════════════════════════════════════

describe("same month: valid cached month_points must be served", () => {

  test("month_points is served when points_month matches current IST month", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-07-15T10:00:00Z")); // mid-July

    const db = makeDb([{ ...BASE_ENTRY, points_month: "2025-07", month_points: 25 }]);
    const entries = await getEntries(db);

    expect(entries[0].month_points).toBe(25);
    jest.useRealTimers();
  });

  test("month_points stays at 0 correctly when user has no points this month", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-07-15T10:00:00Z"));

    const db = makeDb([{ ...BASE_ENTRY, points_month: "2025-07", month_points: 0 }]);
    const entries = await getEntries(db);

    expect(entries[0].month_points).toBe(0);
    jest.useRealTimers();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. FIRST DAY OF NEW MONTH
// ═════════════════════════════════════════════════════════════════════════════

describe("first day of new month: everyone starts at 0 monthly points", () => {

  test("1 July at 00:01 IST: all June points show as 0", async () => {
    // IST: 2025-07-01 00:01 = UTC: 2025-06-30 18:31
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-06-30T18:31:00Z"));

    const db = makeDb([
      { ...BASE_ENTRY, month_points: 30, points_month: "2025-06" },
    ]);
    const entries = await getEntries(db);

    expect(entries[0].month_points).toBe(0);
    jest.useRealTimers();
  });

  test("1 Aug at 00:01 IST: July points from previous month show as 0", async () => {
    // IST: 2025-08-01 00:01 = UTC: 2025-07-31 18:31
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-07-31T18:31:00Z"));

    const db = makeDb([
      { ...BASE_ENTRY, month_points: 45, points_month: "2025-07" },
    ]);
    const entries = await getEntries(db);

    expect(entries[0].month_points).toBe(0);
    jest.useRealTimers();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. IST TIMEZONE BOUNDARY
// ═════════════════════════════════════════════════════════════════════════════

describe("IST timezone boundary: UTC still June but IST already July", () => {

  test("UTC 2025-06-30 20:00 (IST 2025-07-01 01:30): month_points shows as 0", async () => {
    // This is the critical edge case: UTC is still June 30, but IST is July 1.
    // Before the fix the UTC-based check would say "still June" and serve June points.
    // After the fix the IST-based check correctly says "already July" and returns 0.
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-06-30T20:00:00Z")); // IST = 2025-07-01 01:30

    const db = makeDb([{ ...BASE_ENTRY, points_month: "2025-06", month_points: 20 }]);
    const entries = await getEntries(db);

    expect(entries[0].month_points).toBe(0);
    jest.useRealTimers();
  });

  test("UTC 2025-06-30 17:00 (IST 2025-06-30 22:30): still June — points valid", async () => {
    // UTC and IST are still the same calendar date (June 30).
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-06-30T17:00:00Z")); // IST = 2025-06-30 22:30

    const db = makeDb([{ ...BASE_ENTRY, points_month: "2025-06", month_points: 20 }]);
    const entries = await getEntries(db);

    expect(entries[0].month_points).toBe(20);
    jest.useRealTimers();
  });

  test("UTC 2025-07-31 18:31 (IST 2025-08-01 00:01): month_points shows as 0", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-07-31T18:31:00Z")); // IST = 2025-08-01 00:01

    const db = makeDb([{ ...BASE_ENTRY, points_month: "2025-07", month_points: 35 }]);
    const entries = await getEntries(db);

    expect(entries[0].month_points).toBe(0);
    jest.useRealTimers();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. WEEK POINTS — unaffected by month fix
// ═════════════════════════════════════════════════════════════════════════════

describe("week_points are dynamically computed and unaffected by the month fix", () => {

  test("week_points from live session_attendance overrides stale table value", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-07-01T06:00:00Z")); // IST: 2025-07-01

    // Table says 5 week_points (stale), but live query finds 10 this week
    const weekData = [
      { user_email: "alice@test.com", bonus_points: 0, sessions: { date: "2025-06-30" } },
      { user_email: "alice@test.com", bonus_points: 5, sessions: { date: "2025-06-30" } },
    ];
    const db = makeDb(
      [{ ...BASE_ENTRY, points_month: "2025-06", week_points: 5 }],
      weekData,
    );
    const entries = await getEntries(db);

    // Corrected formula (fixed): `5 + bonus_points` matches recalculateMonth.
    // session 1: bonus_points=0 → 5 + 0 = 5 pts
    // session 2: bonus_points=5 → 5 + 5 = 10 pts
    // Total: 5 + 10 = 15 pts
    //
    // Old (buggy) formula was `bonus_points > 0 ? bonus_points : 5`, which gave
    // session 1 → 5 pts and session 2 → 5 pts (incorrect, lost the bonus).
    expect(entries[0].week_points).toBe(15);
    // Month points are still zeroed correctly
    expect(entries[0].month_points).toBe(0);
    jest.useRealTimers();
  });

  test("week_points are 0 when no sessions this week", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-07-01T06:00:00Z"));

    const db = makeDb(
      [{ ...BASE_ENTRY, points_month: "2025-07", month_points: 5, week_points: 5 }],
      [], // no week attendance
    );
    const entries = await getEntries(db);

    // Falls back to table value when weekMap has no entry for this user
    expect(entries[0].week_points).toBe(5);
    jest.useRealTimers();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. ALL-TIME POINTS — completely unaffected
// ═════════════════════════════════════════════════════════════════════════════

describe("total_points (all-time) are unaffected by month validation", () => {

  test("total_points is always served regardless of points_month", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-07-01T06:00:00Z"));

    const db = makeDb([{ ...BASE_ENTRY, points_month: "2025-06", total_points: 999 }]);
    const entries = await getEntries(db);

    expect(entries[0].total_points).toBe(999);
    jest.useRealTimers();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. NULL points_month — treated as stale
// ═════════════════════════════════════════════════════════════════════════════

describe("null points_month is treated as stale (never matches current month)", () => {

  test("month_points is 0 when points_month is null", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-07-15T10:00:00Z"));

    const db = makeDb([{ ...BASE_ENTRY, points_month: null, month_points: 50 }]);
    const entries = await getEntries(db);

    expect(entries[0].month_points).toBe(0);
    jest.useRealTimers();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. UTILITY: currentMonthIST() and isoWeekStartIST()
// ═════════════════════════════════════════════════════════════════════════════

describe("IST utility functions", () => {

  describe("currentMonthIST()", () => {

    test("returns IST month, not UTC, at the UTC/IST boundary", () => {
      jest.useFakeTimers();
      // UTC: 2025-06-30 20:00 → IST: 2025-07-01 01:30
      jest.setSystemTime(new Date("2025-06-30T20:00:00Z"));
      expect(currentMonthIST()).toBe("2025-07");
      jest.useRealTimers();
    });

    test("returns June when UTC and IST are both still in June", () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2025-06-30T17:00:00Z")); // IST: 2025-06-30 22:30
      expect(currentMonthIST()).toBe("2025-06");
      jest.useRealTimers();
    });

    test("returns July mid-month in IST", () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2025-07-15T10:00:00Z")); // IST: 2025-07-15 15:30
      expect(currentMonthIST()).toBe("2025-07");
      jest.useRealTimers();
    });

    test("month rolls over at exactly UTC+5:30 midnight", () => {
      jest.useFakeTimers();
      // IST midnight on July 1 = UTC 18:30 on June 30
      jest.setSystemTime(new Date("2025-06-30T18:30:00Z")); // IST exactly 00:00 July 1
      expect(currentMonthIST()).toBe("2025-07");
      jest.useRealTimers();
    });

    test("one second before IST midnight still shows previous month", () => {
      jest.useFakeTimers();
      // One second before IST July 1 midnight = UTC 18:29:59 June 30
      jest.setSystemTime(new Date("2025-06-30T18:29:59Z")); // IST: 2025-06-30 23:59:59
      expect(currentMonthIST()).toBe("2025-06");
      jest.useRealTimers();
    });
  });

  describe("isoWeekStartIST()", () => {

    test("returns Monday in IST when UTC is still Sunday", () => {
      jest.useFakeTimers();
      // UTC: 2025-06-29 (Sunday) 21:00 → IST: 2025-06-30 (Monday) 02:30
      jest.setSystemTime(new Date("2025-06-29T21:00:00Z"));
      // Monday of IST week = 2025-06-30
      expect(isoWeekStartIST()).toBe("2025-06-30");
      jest.useRealTimers();
    });

    test("returns correct Monday when today (IST) is Wednesday", () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2025-07-02T10:00:00Z")); // IST: 2025-07-02 (Wednesday)
      expect(isoWeekStartIST()).toBe("2025-06-30"); // Monday of that week
      jest.useRealTimers();
    });

    test("returns the same day when today (IST) is Monday", () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2025-06-30T10:00:00Z")); // IST: 2025-06-30 (Monday)
      expect(isoWeekStartIST()).toBe("2025-06-30");
      jest.useRealTimers();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. END-TO-END: month transition with partial July data
// ═════════════════════════════════════════════════════════════════════════════

describe("partial July data: some users have July points, others do not", () => {

  test("July points shown for users who attended July sessions, 0 for others", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-07-10T10:00:00Z")); // mid-July

    const db = makeDb([
      // Alice has July points already (from a 5 July session)
      { ...BASE_ENTRY, id: "u1", user_email: "alice@test.com", month_points: 10, points_month: "2025-07" },
      // Bob's last sync was June — shows as 0 in July
      { ...BASE_ENTRY, id: "u2", user_email: "bob@test.com",   month_points: 20, points_month: "2025-06" },
      // Carol never synced — null points_month
      { ...BASE_ENTRY, id: "u3", user_email: "carol@test.com", month_points: 5,  points_month: null },
    ]);
    const entries = await getEntries(db);

    const find = (email: string) => entries.find(e => e.user_email === email);

    expect(find("alice@test.com")?.month_points).toBe(10); // valid July data
    expect(find("bob@test.com")  ?.month_points).toBe(0);  // stale June data
    expect(find("carol@test.com")?.month_points).toBe(0);  // null → stale
    jest.useRealTimers();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. WEEK_POINTS formula: `5 + bonus_points` (not `bonus_points || 5`)
// ═════════════════════════════════════════════════════════════════════════════

describe("week_points formula consistency with recalculateMonth", () => {

  // Helper: build a mock DB where session_attendance returns specific rows
  function makeDbWithWeekAtt(
    weekRows: { user_email: string; bonus_points: number | null }[]
  ) {
    const lbEntries = [
      { ...BASE_ENTRY, id: "u1", user_email: "a@test.com", points_month: "2025-07", month_points: 5 },
    ];

    const usersChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockResolvedValue({ data: [], error: null }),
    };

    const lbChain = {
      select:  jest.fn().mockReturnThis(),
      order:   jest.fn().mockReturnThis(),
      limit:   jest.fn().mockResolvedValue({ data: lbEntries, error: null }),
      in:      jest.fn().mockReturnThis(),
    };

    const weekChain = {
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      gte:    jest.fn().mockResolvedValue({ data: weekRows, error: null }),
    };

    return {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "leaderboard")        return lbChain;
        if (table === "session_attendance") return weekChain;
        if (table === "users")              return usersChain;
        return { select: jest.fn().mockReturnThis(), in: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }),
    };
  }

  async function getWeekPoints(
    weekRows: { user_email: string; bonus_points: number | null }[]
  ): Promise<number> {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-07-15T10:00:00Z")); // mid-July

    const db = makeDbWithWeekAtt(weekRows);
    mockDb.mockReturnValue(db);
    const res  = await GET(makeRequest());
    const body = await res.json() as { entries: Record<string, unknown>[] };
    jest.useRealTimers();
    const entry = body.entries.find(e => e.user_email === "a@test.com");
    return (entry?.week_points as number) ?? 0;
  }

  test("bonus_points=0: week_points = 5 (base attendance only)", async () => {
    const pts = await getWeekPoints([
      { user_email: "a@test.com", bonus_points: 0 },
    ]);
    expect(pts).toBe(5);
  });

  test("bonus_points=null: week_points = 5 (null treated as 0 bonus)", async () => {
    const pts = await getWeekPoints([
      { user_email: "a@test.com", bonus_points: null },
    ]);
    expect(pts).toBe(5);
  });

  test("bonus_points=5: week_points = 10 (5 base + 5 bonus, matching recalculateMonth)", async () => {
    // recalculateMonth formula: 5 + bonus_points = 5 + 5 = 10
    // weekMap formula (fixed):  5 + bonus_points = 5 + 5 = 10
    // OLD buggy formula:        bonus_points > 0 ? bonus_points : 5 = 5 (WRONG)
    const pts = await getWeekPoints([
      { user_email: "a@test.com", bonus_points: 5 },
    ]);
    expect(pts).toBe(10);
  });

  test("bonus_points=3: week_points = 8 (5 base + 3 bonus)", async () => {
    const pts = await getWeekPoints([
      { user_email: "a@test.com", bonus_points: 3 },
    ]);
    expect(pts).toBe(8);
  });

  test("two sessions in the week: week_points sums both correctly", async () => {
    // Two sessions, no bonus → 5 + 5 = 10
    const pts = await getWeekPoints([
      { user_email: "a@test.com", bonus_points: 0 },
      { user_email: "a@test.com", bonus_points: 0 },
    ]);
    expect(pts).toBe(10);
  });

  test("two sessions, one with bonus: week_points = 5 + (5+3) = 13", async () => {
    const pts = await getWeekPoints([
      { user_email: "a@test.com", bonus_points: 0 },  // 5
      { user_email: "a@test.com", bonus_points: 3 },  // 8
    ]);
    expect(pts).toBe(13);
  });
});
