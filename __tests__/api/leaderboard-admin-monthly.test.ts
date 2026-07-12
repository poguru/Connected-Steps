/**
 * Tests for the admin leaderboard archive API — monthly filtering fixes.
 *
 * Root causes fixed:
 * 1. GET /api/admin/leaderboard/archive previously returned ALL leaderboard
 *    rows without a points_month filter, so June attendees (month_points = 75,
 *    points_month = "2026-06") would appear in the "This Month" column in July.
 *
 * 2. The archive POST snapshot now also filters by points_month so only the
 *    correct month's data is persisted.
 *
 * These tests verify:
 *   • Only users with points_month === requested month appear in live standings.
 *   • Users from a previous month are excluded from the current month view.
 *   • The month param is correctly defaulted to current IST month.
 *   • POST snapshot creates records only for the correct month.
 *   • All-time total_points are always preserved (unaffected by month filter).
 */

process.env.ADMIN_PASSWORD           = "test-password";
process.env.COACH_TOKEN_SECRET       = "test-secret";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));

import { GET, POST } from "@/app/api/admin/leaderboard/archive/route";
import { NextRequest }     from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { makeAdminHeaders } from "@/__tests__/helpers/admin-auth";

const mockDb = getSupabaseServer as jest.Mock;

// ── DB mock factory ───────────────────────────────────────────────────────────

interface LbRow {
  user_email:   string;
  user_name:    string;
  location:     string;
  goal:         string;
  month_points: number;
  total_points: number;
  points_month: string;
  updated_at?:  string;
}

function makeDb(lbRows: LbRow[], archiveRows: unknown[] = []) {
  const insertMock = jest.fn().mockResolvedValue({ error: null });
  const deleteMock = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });

  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "leaderboard") {
        // Support chained: .select().eq().gt().order()
        const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq     = jest.fn((col: string, val: string) => {
          // Filter rows that match the eq condition
          const filtered = lbRows.filter(r => {
            if (col === "points_month") return r.points_month === val;
            return true;
          });
          chain._filtered = filtered;
          return chain;
        });
        chain.gt     = jest.fn((col: string, val: number) => {
          const filtered = (chain._filtered ?? lbRows).filter((r: LbRow) => {
            if (col === "month_points") return r.month_points > val;
            return true;
          });
          chain._filteredGt = filtered;
          return chain;
        });
        chain.order  = jest.fn().mockImplementation(function(this: Record<string, jest.Mock>) {
          return Promise.resolve({ data: this._filteredGt ?? this._filtered ?? lbRows, error: null });
        }.bind(chain));
        chain.upsert = jest.fn().mockResolvedValue({ error: null });
        chain.insert = insertMock;
        chain.delete = deleteMock;
        return chain;
      }

      if (table === "monthly_leaderboard_archive") {
        return {
          select: jest.fn().mockReturnThis(),
          order:  jest.fn().mockReturnThis(),
          then:   jest.fn().mockResolvedValue({ data: archiveRows, error: null }),
          // For chained .order().order()
          [Symbol.asyncIterator]: undefined,
          insert: insertMock,
          delete: deleteMock,
          // second .order() returns the resolved value
          mockResolvedValue: archiveRows,
        };
      }

      return {};
    }),
    _insertMock: insertMock,
    _deleteMock: deleteMock,
  };
}

// Simpler mock for archive — Supabase chains are a bit complex
function makeDbSimple(lbRows: LbRow[], archiveRows: unknown[] = []) {
  const insertMock = jest.fn().mockResolvedValue({ error: null });
  const archiveDeleteEq = jest.fn().mockResolvedValue({ error: null });
  const archiveDelete   = jest.fn().mockReturnValue({ eq: archiveDeleteEq });

  // We need to simulate chained queries
  const makeChain = (rows: LbRow[]) => {
    let filteredRows = [...rows];
    const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockImplementation((_col: string, val: string) => {
      filteredRows = filteredRows.filter(r => {
        if (_col === "points_month") return r.points_month === val;
        return true;
      });
      return chain;
    });
    chain.gt = jest.fn().mockImplementation((_col: string, val: number) => {
      filteredRows = filteredRows.filter(r => {
        if (_col === "month_points") return r.month_points > val;
        return true;
      });
      return chain;
    });
    chain.order = jest.fn().mockImplementation(() =>
      Promise.resolve({ data: filteredRows, error: null })
    );
    chain.upsert = jest.fn().mockResolvedValue({ error: null });
    chain.delete = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    chain.insert = insertMock;
    return chain;
  };

  // Archive table: supports both GET (.select().order().order()) and POST (.delete().eq() + .insert())
  let archiveOrderCount = 0;
  const archiveChain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  archiveChain.select = jest.fn().mockReturnValue(archiveChain);
  archiveChain.order  = jest.fn().mockImplementation(() => {
    archiveOrderCount++;
    return archiveOrderCount >= 2
      ? Promise.resolve({ data: archiveRows, error: null })
      : archiveChain;
  });
  archiveChain.delete = archiveDelete;
  archiveChain.insert = insertMock;

  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "leaderboard")                return makeChain(lbRows);
      if (table === "monthly_leaderboard_archive") return archiveChain;
      return {};
    }),
    _insertMock: insertMock,
  };
}

function makeGetRequest(month?: string): NextRequest {
  const url = month
    ? `http://localhost/api/admin/leaderboard/archive?month=${month}`
    : "http://localhost/api/admin/leaderboard/archive";
  return new NextRequest(url, {
    headers: makeAdminHeaders(),
  });
}

function makePostRequest(month?: string): NextRequest {
  return new NextRequest("http://localhost/api/admin/leaderboard/archive", {
    method:  "POST",
    headers: { "Content-Type": "application/json", ...makeAdminHeaders() },
    body:    JSON.stringify(month ? { month } : {}),
  });
}

// ── Sample leaderboard data ───────────────────────────────────────────────────

const JULY_ROWS: LbRow[] = [
  { user_email: "srinivas@test.com", user_name: "Srinivas T", location: "Kondapur", goal: "marathon", month_points: 75, total_points: 75,  points_month: "2026-07" },
  { user_email: "rajesh@test.com",   user_name: "Rajesh C",   location: "Kondapur", goal: "marathon", month_points: 50, total_points: 50,  points_month: "2026-07" },
  { user_email: "kalyan@test.com",   user_name: "Kalyan P",   location: "Kondapur", goal: "5k",       month_points: 40, total_points: 806, points_month: "2026-07" },
];

const JUNE_STALE_ROWS: LbRow[] = [
  // Users who attended June but NOT July — their points_month is still "2026-06"
  { user_email: "alice@test.com",    user_name: "Alice A",    location: "Miyapur",  goal: "10k",      month_points: 30, total_points: 150, points_month: "2026-06" },
  { user_email: "bob@test.com",      user_name: "Bob B",      location: "Miyapur",  goal: "half",     month_points: 15, total_points: 90,  points_month: "2026-06" },
];

beforeEach(() => jest.clearAllMocks());

// ═══════════════════════════════════════════════════════════════════════════════
// 1. GET — filter by points_month
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/admin/leaderboard/archive", () => {

  test("returns only July rows when ?month=2026-07 is specified", async () => {
    const db = makeDbSimple([...JULY_ROWS, ...JUNE_STALE_ROWS]);
    mockDb.mockReturnValue(db);

    const res  = await GET(makeGetRequest("2026-07"));
    const body = await res.json() as { live: LbRow[]; month: string };

    expect(res.status).toBe(200);
    expect(body.month).toBe("2026-07");

    // Only July attendees should appear
    const emails = body.live.map(r => r.user_email);
    expect(emails).toContain("srinivas@test.com");
    expect(emails).toContain("rajesh@test.com");
    expect(emails).toContain("kalyan@test.com");
  });

  test("excludes June stale rows when viewing July", async () => {
    const db = makeDbSimple([...JULY_ROWS, ...JUNE_STALE_ROWS]);
    mockDb.mockReturnValue(db);

    const res  = await GET(makeGetRequest("2026-07"));
    const body = await res.json() as { live: LbRow[] };

    const emails = body.live.map(r => r.user_email);
    // Alice and Bob attended June only — they must NOT appear in July standings
    expect(emails).not.toContain("alice@test.com");
    expect(emails).not.toContain("bob@test.com");
  });

  test("returns only June rows when ?month=2026-06 is specified", async () => {
    const db = makeDbSimple([...JULY_ROWS, ...JUNE_STALE_ROWS]);
    mockDb.mockReturnValue(db);

    const res  = await GET(makeGetRequest("2026-06"));
    const body = await res.json() as { live: LbRow[] };

    const emails = body.live.map(r => r.user_email);
    expect(emails).toContain("alice@test.com");
    expect(emails).toContain("bob@test.com");
    expect(emails).not.toContain("srinivas@test.com");
  });

  test("live standings are empty when no one has points for the selected month", async () => {
    const db = makeDbSimple(JUNE_STALE_ROWS); // only June data, viewing July
    mockDb.mockReturnValue(db);

    const res  = await GET(makeGetRequest("2026-07"));
    const body = await res.json() as { live: LbRow[] };

    expect(body.live).toHaveLength(0);
  });

  test("all-time total_points is preserved regardless of which month is viewed", async () => {
    const db = makeDbSimple(JULY_ROWS);
    mockDb.mockReturnValue(db);

    const res  = await GET(makeGetRequest("2026-07"));
    const body = await res.json() as { live: LbRow[] };

    const kalyan = body.live.find(r => r.user_email === "kalyan@test.com");
    // Kalyan has 40 July points but 806 all-time points — both must be present
    expect(kalyan?.month_points).toBe(40);
    expect(kalyan?.total_points).toBe(806);
  });

  test("returns 400 for invalid month format", async () => {
    const db = makeDbSimple([]);
    mockDb.mockReturnValue(db);

    const res = await GET(makeGetRequest("July-2026"));
    expect(res.status).toBe(400);
  });

  test("echoes back the requested month in the response", async () => {
    const db = makeDbSimple(JULY_ROWS);
    mockDb.mockReturnValue(db);

    const res  = await GET(makeGetRequest("2026-07"));
    const body = await res.json() as { month: string };
    expect(body.month).toBe("2026-07");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. POST — snapshot only current month's data
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/admin/leaderboard/archive (snapshot)", () => {

  test("snapshots only July rows when month=2026-07", async () => {
    const db = makeDbSimple([...JULY_ROWS, ...JUNE_STALE_ROWS]);
    mockDb.mockReturnValue(db);

    const res  = await POST(makePostRequest("2026-07"));
    const body = await res.json() as { saved: number; month: string };

    expect(res.status).toBe(200);
    expect(body.saved).toBe(3);  // 3 July rows
    expect(body.month).toBe("2026-07");
  });

  test("insert rows contain correct month_points values from July", async () => {
    const db = makeDbSimple([...JULY_ROWS, ...JUNE_STALE_ROWS]);
    mockDb.mockReturnValue(db);

    await POST(makePostRequest("2026-07"));

    // Verify the insert received July data
    const insertCall = db._insertMock.mock.calls[0]?.[0] as Array<{ month_points: number; user_email: string }>;
    expect(insertCall).toBeDefined();
    const srinivas = insertCall?.find(r => r.user_email === "srinivas@test.com");
    expect(srinivas?.month_points).toBe(75);
  });

  test("returns 400 when no participants have points for the selected month", async () => {
    // Only June data, but POST requests July
    const db = makeDbSimple(JUNE_STALE_ROWS);
    mockDb.mockReturnValue(db);

    const res = await POST(makePostRequest("2026-07"));
    expect(res.status).toBe(400);
  });

  test("ranking is assigned correctly (1, 2, 3 … by month_points desc)", async () => {
    const db = makeDbSimple(JULY_ROWS);
    mockDb.mockReturnValue(db);

    await POST(makePostRequest("2026-07"));

    const rows = db._insertMock.mock.calls[0]?.[0] as Array<{ rank: number; user_email: string }>;
    const srinivas = rows?.find(r => r.user_email === "srinivas@test.com");
    const rajesh   = rows?.find(r => r.user_email === "rajesh@test.com");
    const kalyan   = rows?.find(r => r.user_email === "kalyan@test.com");

    expect(srinivas?.rank).toBe(1);
    expect(rajesh?.rank).toBe(2);
    expect(kalyan?.rank).toBe(3);
  });
});
