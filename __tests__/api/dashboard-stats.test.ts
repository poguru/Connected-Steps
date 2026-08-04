// Regression tests for admin dashboard statistics accuracy.
//
// Verifies:
//  Dashboard API (/api/admin/dashboard)
//   1.  totalMembers   — users table COUNT(*), never capped by pagination
//   2.  totalParticipants — event_participants COUNT WHERE status='active'
//                          NOT event_registrations (which overcounts multi-participant bookings)
//   3.  upcomingRegistrations — event_registrations COUNT WHERE status='confirmed'
//   4.  totalParticipants >= upcomingRegistrations (multi-participant registrations)
//   5.  Cache miss returns X-Cache: MISS header
//   6.  Cache hit short-circuits DB queries (X-Cache: HIT, no DB calls)
//
//  Users API (/api/admin/users)
//   7.  stats.total = DB COUNT(*) — never capped by PAGE_SIZE (200)
//   8.  stats.total correct when user count > PAGE_SIZE (the original bug: showed 200)
//   9.  stats.has_more=true when returned rows equal PAGE_SIZE
//   10. stats.has_more=false when returned rows fewer than PAGE_SIZE

process.env.ADMIN_PASSWORD            = "test-admin";
process.env.COACH_TOKEN_SECRET        = "test-secret";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

import { NextRequest } from "next/server";

// ── Mocks (declared before any imports so jest.mock hoisting works) ────────────

const mockGetSupabase = jest.fn();
jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => mockGetSupabase() }));

jest.mock("@/lib/admin-auth", () => ({
  isAdminOrCoach: jest.fn().mockResolvedValue(true),
  getAdminEmail:  jest.fn().mockReturnValue("admin"),
}));

let cacheGetImpl: (...args: unknown[]) => Promise<unknown> = async () => null;
jest.mock("@/lib/cache", () => ({
  cacheGet: (...args: unknown[]) => cacheGetImpl(...args),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  CK:  { adminDashboard: (k: string) => `admin:dash:v1:${k}` },
  TTL: { adminDashboard: 60 },
}));

// ── Supabase chain builder ────────────────────────────────────────────────────

/** Returns a thenable chain that resolves to { data, count, error: null }. */
function chain(count: number | null = null, data: unknown[] | null = null): Record<string, unknown> {
  const resolved = Promise.resolve({ data: data ?? [], count, error: null });
  // All chainable methods return the same thenable object
  const c: Record<string, unknown> = {
    then:      resolved.then.bind(resolved),
    catch:     resolved.catch.bind(resolved),
    finally:   resolved.finally.bind(resolved),
  };
  const noop = () => c;
  for (const m of ["select","eq","in","gt","gte","lte","order","range","or","is","not"]) {
    c[m] = noop;
  }
  return c;
}

// ── Dashboard API tests ───────────────────────────────────────────────────────

describe("GET /api/admin/dashboard", () => {
  const { GET } = jest.requireActual<typeof import("@/app/api/admin/dashboard/route")>(
    "@/app/api/admin/dashboard/route"
  );

  function makeReq() {
    return new NextRequest("http://localhost/api/admin/dashboard");
  }

  beforeEach(() => {
    cacheGetImpl = async () => null;  // cache miss by default
  });

  function buildDb({
    userCount          = 500,
    activeMemberCount  = 80,
    newMemberCount     = 12,
    upcomingEventCount = 3,
    confirmedRegCount  = 350,
    activeParticipants = 420,
    pendingStories     = 2,
    pendingPosts       = 5,
  } = {}) {
    const tableCounts: Record<string, number | null> = {
      users:                userCount,
      memberships:          activeMemberCount,
      events:               upcomingEventCount,
      event_registrations:  confirmedRegCount,
      event_participants:   activeParticipants,
      stories:              pendingStories,
      community_posts:      pendingPosts,
    };
    // memberships revenue call returns data[] not just count
    const tableData: Record<string, unknown[]> = {
      memberships:         [{ amount_paid: 9900 }, { amount_paid: 9900 }],
      event_registrations: [{ final_price: 200 }],
    };
    mockGetSupabase.mockReturnValue({
      from: (table: string) =>
        chain(tableCounts[table] ?? 0, tableData[table] ?? []),
    });
  }

  test("1. totalMembers comes from users COUNT(*), not a paginated slice", async () => {
    buildDb({ userCount: 1234 });
    const res  = await GET(makeReq());
    const body = await res.json() as Record<string, number>;
    expect(body.totalMembers).toBe(1234);
  });

  test("2. totalParticipants comes from event_participants (active), not event_registrations", async () => {
    buildDb({ confirmedRegCount: 350, activeParticipants: 420 });
    const res  = await GET(makeReq());
    const body = await res.json() as Record<string, number>;
    // Correct: physical participant slots (event_participants.status='active')
    expect(body.totalParticipants).toBe(420);
  });

  test("3. upcomingRegistrations counts event_registrations WHERE status=confirmed", async () => {
    buildDb({ confirmedRegCount: 99, activeParticipants: 104 });
    const res  = await GET(makeReq());
    const body = await res.json() as Record<string, number>;
    expect(body.upcomingRegistrations).toBe(99);
  });

  test("4. totalParticipants can exceed upcomingRegistrations (multi-participant bookings)", async () => {
    buildDb({ confirmedRegCount: 350, activeParticipants: 420 });
    const res  = await GET(makeReq());
    const body = await res.json() as Record<string, number>;
    expect(body.totalParticipants).toBeGreaterThanOrEqual(body.upcomingRegistrations);
  });

  test("5. cache miss returns X-Cache: MISS", async () => {
    buildDb();
    const res = await GET(makeReq());
    expect(res.headers.get("X-Cache")).toBe("MISS");
  });

  test("6. cache hit short-circuits DB and returns X-Cache: HIT", async () => {
    const cachedBody = { totalMembers: 999, totalParticipants: 111 };
    cacheGetImpl = async () => cachedBody;

    const fromSpy = jest.fn();
    mockGetSupabase.mockReturnValue({ from: fromSpy });

    const res  = await GET(makeReq());
    const body = await res.json();

    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(body).toEqual(cachedBody);
    expect(fromSpy).not.toHaveBeenCalled();
  });
});

// ── Users API tests ───────────────────────────────────────────────────────────

describe("GET /api/admin/users", () => {
  const { GET } = jest.requireActual<typeof import("@/app/api/admin/users/route")>(
    "@/app/api/admin/users/route"
  );

  function makeReq() {
    return new NextRequest("http://localhost/api/admin/users");
  }

  function makeUser(email: string) {
    return {
      email, first_name: "Test", last_name: "User", phone: "9999999999",
      goal: "5k", location: "Hyd", created_at: "2026-01-01",
      is_active: true, phone_verified: false, phone_verified_at: null,
    };
  }

  /** Wire up the supabase mock for the users route.
   *  The route calls db.from("users") TWICE:
   *    1st call → paginated select (with .order().range())
   *    2nd call → head-only COUNT for the true total
   */
  function buildDb(pageRows: unknown[], trueTotal: number) {
    const pageResult = Promise.resolve({ data: pageRows, count: pageRows.length, error: null });
    const countResult = Promise.resolve({ data: null, count: trueTotal, error: null });

    let usersCallCount = 0;

    mockGetSupabase.mockReturnValue({
      from: (table: string) => {
        if (table === "users") {
          usersCallCount++;
          if (usersCallCount === 1) {
            // Paginated select: return a chain that all methods resolve to pageResult
            const c: Record<string, unknown> = {
              then: pageResult.then.bind(pageResult),
            };
            const noop = () => c;
            for (const m of ["select","order","range","or","eq"]) c[m] = noop;
            return c;
          }
          // Head-only count call
          const c: Record<string, unknown> = {
            then: countResult.then.bind(countResult),
          };
          const noop = () => c;
          for (const m of ["select","eq","head"]) c[m] = noop;
          return c;
        }
        // memberships, leaderboard, session_attendance
        const empty = Promise.resolve({ data: [], error: null });
        const c: Record<string, unknown> = {
          then: empty.then.bind(empty),
        };
        const noop = () => c;
        for (const m of ["select","eq","order"]) c[m] = noop;
        return c;
      },
    });
  }

  test("7 & 8. stats.total is DB COUNT(*), NOT page length — the 200-cap bug", async () => {
    // Simulate 850 users total in the DB but only 200 come back on page 0
    const page0 = Array.from({ length: 200 }, (_, i) => makeUser(`u${i}@test.com`));
    buildDb(page0, 850);

    const res  = await GET(makeReq());
    const body = await res.json() as { stats: { total: number; has_more: boolean } };

    // BUG REGRESSION: before fix this returned 200 (users.length), not 850
    expect(body.stats.total).toBe(850);
    expect(body.stats.has_more).toBe(true);
  });

  test("9. stats.total correct when user count equals PAGE_SIZE exactly", async () => {
    const page0 = Array.from({ length: 200 }, (_, i) => makeUser(`u${i}@test.com`));
    buildDb(page0, 200);

    const res  = await GET(makeReq());
    const body = await res.json() as { stats: { total: number } };

    expect(body.stats.total).toBe(200);
  });

  test("9. stats.total correct when fewer than PAGE_SIZE users exist", async () => {
    const page0 = Array.from({ length: 42 }, (_, i) => makeUser(`u${i}@test.com`));
    buildDb(page0, 42);

    const res  = await GET(makeReq());
    const body = await res.json() as { stats: { total: number; has_more: boolean } };

    expect(body.stats.total).toBe(42);
    expect(body.stats.has_more).toBe(false);
  });

  test("10. has_more=true when page is full (rows.length === PAGE_SIZE)", async () => {
    const full = Array.from({ length: 200 }, (_, i) => makeUser(`u${i}@t.com`));
    buildDb(full, 300);

    const res  = await GET(makeReq());
    const body = await res.json() as { stats: { has_more: boolean } };

    expect(body.stats.has_more).toBe(true);
  });

  test("10. has_more=false when page is partial (rows.length < PAGE_SIZE)", async () => {
    const partial = Array.from({ length: 80 }, (_, i) => makeUser(`u${i}@t.com`));
    buildDb(partial, 80);

    const res  = await GET(makeReq());
    const body = await res.json() as { stats: { has_more: boolean } };

    expect(body.stats.has_more).toBe(false);
  });
});
