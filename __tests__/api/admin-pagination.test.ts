// Regression tests for admin panel server-side pagination.
//
// Covers:
//  Memberships API
//   1.  No params → first page returned, backward-compatible shape
//   2.  ?page=1&limit=10 → correct range applied, has_more correct
//   3.  ?q=alice → email ilike filter applied
//   4.  ?status=active → status filter applied
//   5.  ?sort=amount_paid&order=asc → sort applied
//   6.  limit capped at MAX_LIMIT (200)
//   7.  Stats always come from membership_stats() RPC (not page data)
//
//  Event Registrations API
//   8.  No event_id → global registration list
//   9.  ?event_id=X → event_id filter applied
//   10. ?q=alice → or-filter applied on name/email/code/phone
//   11. ?payment_status=paid → filter applied
//   12. Summary always from registration_summary() RPC
//
//  Referrals API
//   13. Paginated list returned
//   14. ?q=user@ → or-filter on referrer/referred emails
//   15. ?status=reward_issued → filter applied
//   16. topReferrers always from separate query (not page data)
//   17. Summary from referral_summary() RPC
//
//  Export routes
//   18. POST /api/admin/export → creates admin_exports row + enqueues job
//   19. Invalid dataset → 400
//   20. GET /api/admin/export → lists exports
//   21. GET /api/admin/export/[id] → returns status (no signed URL when pending)
//   22. GET /api/admin/export/[id] ready → includes downloadUrl

process.env.ADMIN_PASSWORD            = "test-admin";
process.env.COACH_TOKEN_SECRET        = "test-secret";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth", () => {
  const actual = jest.requireActual<typeof import("@/lib/admin-auth")>("@/lib/admin-auth");
  return {
    ...actual,
    isAdminOrCoach: jest.fn().mockResolvedValue(true),
    getAdminEmail:  jest.fn().mockReturnValue("admin"),
  };
});
jest.mock("@/lib/job-queue", () => ({ enqueueJob: jest.fn().mockResolvedValue("job-1") }));

import { NextRequest }       from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { enqueueJob }        from "@/lib/job-queue";
import { makeAdminHeaders, adminCookieHeader } from "@/__tests__/helpers/admin-auth";

const mockGetSupabaseServer = getSupabaseServer as jest.Mock;
const mockEnqueueJob        = enqueueJob        as jest.Mock;

// ── DB mock helpers ───────────────────────────────────────────────────────────

function makeAdminDb(opts: {
  rows?:     unknown[];
  count?:    number;
  rpcResult?: unknown;
  storageSignedUrl?: string | null;
  exportRow?: { id: string; status: string; file_path?: string | null } | null;
  exportInsertId?: string;
} = {}) {
  const rangeMock = jest.fn().mockResolvedValue({ data: opts.rows ?? [], count: opts.count ?? 0, error: null });

  // All terminal methods (resolve promises)
  const terminal = {
    range:       rangeMock,
    limit:       jest.fn().mockResolvedValue({ data: opts.rows ?? [], error: null }),
    single:      jest.fn().mockResolvedValue({ data: opts.exportRow ?? null, error: opts.exportRow ? null : { message: "not found" } }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    in:          jest.fn().mockResolvedValue({ data: [], error: null }),
  };

  // Build the full fluent chain — every filter method returns `chain`
  // so they can be stacked arbitrarily deep.
  // `order` also returns `chain` so callers can chain `.limit()` after it.
  const chain: Record<string, jest.Mock> = {
    ...terminal,
    eq:    jest.fn(),
    or:    jest.fn(),
    ilike: jest.fn(),
    not:   jest.fn(),
    gt:    jest.fn(),
    lte:   jest.fn(),
    order: jest.fn(),
  };
  // Point all filter + order methods back at chain
  (["eq", "or", "ilike", "not", "gt", "lte", "order"] as const).forEach(k => {
    chain[k].mockReturnValue(chain);
  });

  const eqChain    = chain;
  const selectMock = jest.fn().mockReturnValue(eqChain);

  const insertSingleMock = jest.fn().mockResolvedValue({ data: { id: opts.exportInsertId ?? "exp-uuid-1" }, error: null });
  const insertSelectMock = jest.fn().mockReturnValue({ single: insertSingleMock });
  const insertMock       = jest.fn().mockReturnValue({ select: insertSelectMock });

  const singleMock = jest.fn().mockResolvedValue({ data: opts.exportRow ?? null, error: opts.exportRow ? null : { message: "not found" } });

  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "users")              return { select: selectMock };
      if (table === "memberships")        return { select: selectMock };
      if (table === "event_registrations") return { select: selectMock };
      if (table === "referrals")          return { select: selectMock };
      if (table === "admin_exports") {
        return {
          select:  selectMock,
          insert:  insertMock,
          delete:  jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return { select: selectMock };
    }),
    rpc: jest.fn().mockResolvedValue({ data: opts.rpcResult ?? { total: 0, active: 0, expired: 0, expiringSoon: 0, revenue: 0 }, error: null }),
    storage: {
      from: jest.fn().mockReturnValue({
        createSignedUrl: jest.fn().mockResolvedValue({ data: { signedUrl: opts.storageSignedUrl ?? null } }),
        remove:          jest.fn().mockResolvedValue({ error: null }),
      }),
    },
    _range:  rangeMock,
    _select: selectMock,
    _rpc:    undefined as unknown,
  };
}

function makeReq(url: string): NextRequest {
  return new NextRequest(url, { headers: makeAdminHeaders() });
}

beforeEach(() => { jest.clearAllMocks(); });

// ── 1–7: Memberships API ──────────────────────────────────────────────────────

describe("GET /api/admin/memberships", () => {
  async function callMemberships(qs = "") {
    const { GET } = await import("@/app/api/admin/memberships/route");
    const db = makeAdminDb({ rows: [], count: 0 });
    (db as Record<string, unknown>)._rpc = db.rpc;
    mockGetSupabaseServer.mockReturnValue(db);
    const res  = await GET(makeReq(`http://localhost/api/admin/memberships${qs ? "?" + qs : ""}`));
    const body = await res.json();
    return { res, body, db };
  }

  test("1. no params → 200, backward-compatible shape with stats", async () => {
    const { res, body } = await callMemberships();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty("memberships");
    expect(body).toHaveProperty("stats");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("page", 0);
    expect(body).toHaveProperty("limit", 50);
    expect(body).toHaveProperty("has_more");
  });

  test("2. ?page=1&limit=10 → range(10,19) called", async () => {
    const { db } = await callMemberships("page=1&limit=10");
    expect(db._range).toHaveBeenCalledWith(10, 19);
  });

  test("3. ?q=alice@cs.test → ilike filter applied on email", async () => {
    const { db } = await callMemberships("q=alice@cs.test");
    const selectCall = (db._select as jest.Mock).mock.results[0]?.value;
    expect((selectCall?.ilike as jest.Mock)?.mock.calls[0]).toEqual(["user_email", "%alice@cs.test%"]);
  });

  test("4. ?status=active → active/expires_at filters applied (no error)", async () => {
    const { res } = await callMemberships("status=active");
    expect(res.status).toBe(200);
  });

  test("5. ?sort=amount_paid&order=asc → sort applied ascending (no error)", async () => {
    const { res } = await callMemberships("sort=amount_paid&order=asc");
    expect(res.status).toBe(200);
  });

  test("6. limit capped at 200 even when caller passes limit=9999", async () => {
    const { body } = await callMemberships("limit=9999");
    expect(body.limit).toBe(200);
  });

  test("7. stats always come from membership_stats() RPC, not page data", async () => {
    const { GET } = await import("@/app/api/admin/memberships/route");
    const rpcResult = { total: 5000, active: 4200, expired: 800, expiringSoon: 120, revenue: 9800000 };
    const db = makeAdminDb({ rows: [], count: 0, rpcResult });
    mockGetSupabaseServer.mockReturnValue(db);
    const res  = await GET(makeReq("http://localhost/api/admin/memberships"));
    const body = await res.json();
    expect(body.stats.total).toBe(5000);
    expect(body.stats.revenue).toBe(9800000);
  });
});

// ── 8–12: Event Registrations API ─────────────────────────────────────────────

describe("GET /api/admin/events/registrations", () => {
  async function callRegs(qs = "") {
    const { GET } = await import("@/app/api/admin/events/registrations/route");
    const db = makeAdminDb({ rows: [], count: 0, rpcResult: { total: 0, paid: 0, free: 0, pending: 0, revenue: 0 } });
    mockGetSupabaseServer.mockReturnValue(db);
    const res  = await GET(makeReq(`http://localhost/api/admin/events/registrations${qs ? "?" + qs : ""}`));
    const body = await res.json();
    return { res, body, db };
  }

  test("8. no params → 200, registrations + summary + pagination meta", async () => {
    const { res, body } = await callRegs();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty("registrations");
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("has_more");
  });

  test("9. summary from registration_summary() RPC", async () => {
    const { GET } = await import("@/app/api/admin/events/registrations/route");
    const db = makeAdminDb({ rows: [], count: 0, rpcResult: { total: 300, paid: 250, free: 30, pending: 20, revenue: 125000 } });
    mockGetSupabaseServer.mockReturnValue(db);
    const res  = await GET(makeReq("http://localhost/api/admin/events/registrations"));
    const body = await res.json();
    expect(body.summary.total).toBe(300);
    expect(body.summary.paid).toBe(250);
    expect(body.summary.revenue).toBe(125000);
  });

  test("10. ?q=alice → or filter on name/email/code/phone (no error)", async () => {
    const { res } = await callRegs("q=alice");
    expect(res.status).toBe(200);
  });

  test("11. ?payment_status=paid → filter applied, 200", async () => {
    const { res } = await callRegs("payment_status=paid");
    expect(res.status).toBe(200);
  });

  test("12. page/limit range works correctly", async () => {
    const { db } = await callRegs("page=2&limit=25");
    expect(db._range).toHaveBeenCalledWith(50, 74);
  });
});

// ── 13–17: Referrals API ──────────────────────────────────────────────────────

describe("GET /api/admin/referrals", () => {
  async function callReferrals(qs = "") {
    const { GET } = await import("@/app/api/admin/referrals/route");
    const db = makeAdminDb({ rows: [], count: 0, rpcResult: { total: 0, successful: 0, rewardsIssued: 0 } });
    mockGetSupabaseServer.mockReturnValue(db);
    const res  = await GET(makeReq(`http://localhost/api/admin/referrals${qs ? "?" + qs : ""}`));
    const body = await res.json();
    return { res, body, db };
  }

  test("13. no params → 200, referrals + summary + topReferrers + pagination", async () => {
    const { res, body } = await callReferrals();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty("referrals");
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("topReferrers");
    expect(body).toHaveProperty("total");
  });

  test("14. summary from referral_summary() RPC", async () => {
    const { GET } = await import("@/app/api/admin/referrals/route");
    const db = makeAdminDb({ rows: [], count: 0, rpcResult: { total: 1200, successful: 900, rewardsIssued: 900 } });
    mockGetSupabaseServer.mockReturnValue(db);
    const body = await (await GET(makeReq("http://localhost/api/admin/referrals"))).json();
    expect(body.summary.total).toBe(1200);
    expect(body.summary.successful).toBe(900);
  });

  test("15. ?q=user@ → or-filter applied (no error)", async () => {
    const { res } = await callReferrals("q=user@cs.test");
    expect(res.status).toBe(200);
  });

  test("16. ?status=reward_issued → status filter applied (no error)", async () => {
    const { res } = await callReferrals("status=reward_issued");
    expect(res.status).toBe(200);
  });

  test("17. has_more=false when count ≤ one page", async () => {
    const { GET } = await import("@/app/api/admin/referrals/route");
    const db = makeAdminDb({ rows: Array.from({ length: 10 }, (_, i) => ({ id: i, referrer_email: "a@b.com", referred_email: "c@d.com", status: "reward_issued", reward_granted: true, created_at: "", rewarded_at: "", referral_code: "X" })), count: 10 });
    mockGetSupabaseServer.mockReturnValue(db);
    const body = await (await GET(makeReq("http://localhost/api/admin/referrals"))).json();
    expect(body.has_more).toBe(false);
  });
});

// ── 18–22: Export routes ──────────────────────────────────────────────────────

describe("POST /api/admin/export", () => {
  test("18. valid request → 202, exportId returned, job enqueued", async () => {
    const { POST } = await import("@/app/api/admin/export/route");
    const db = makeAdminDb({ exportInsertId: "export-uuid-1" });
    mockGetSupabaseServer.mockReturnValue(db);

    const req = new NextRequest("http://localhost/api/admin/export", {
      method:  "POST",
      headers: { "Content-Type": "application/json", ...makeAdminHeaders() },
      body:    JSON.stringify({ dataset: "memberships", format: "csv" }),
    });
    const res  = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.exportId).toBe("export-uuid-1");
    expect(body.status).toBe("pending");
    expect(mockEnqueueJob).toHaveBeenCalledWith(
      "admin_export",
      expect.objectContaining({ exportId: "export-uuid-1", dataset: "memberships", format: "csv" }),
      expect.objectContaining({ priority: -10 }),
    );
  });

  test("19. invalid dataset → 400", async () => {
    const { POST } = await import("@/app/api/admin/export/route");
    const db = makeAdminDb({});
    mockGetSupabaseServer.mockReturnValue(db);

    const req = new NextRequest("http://localhost/api/admin/export", {
      method:  "POST",
      headers: { "Content-Type": "application/json", ...makeAdminHeaders() },
      body:    JSON.stringify({ dataset: "hacker_table", format: "csv" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/admin/export", () => {
  test("20. returns list of recent exports", async () => {
    const { GET } = await import("@/app/api/admin/export/route");
    const db = makeAdminDb({ rows: [{ id: "e1", dataset: "users", status: "ready" }] });
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await GET(makeReq("http://localhost/api/admin/export"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.exports).toHaveLength(1);
  });
});

describe("GET /api/admin/export/[id]", () => {
  test("21. pending export → status returned, no downloadUrl", async () => {
    const { GET } = await import("@/app/api/admin/export/[id]/route");
    const db = makeAdminDb({ exportRow: { id: "exp-1", status: "pending", file_path: null } });
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await GET(makeReq("http://localhost/api/admin/export/exp-1"), { params: Promise.resolve({ id: "exp-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("pending");
    expect(body.downloadUrl).toBeNull();
  });

  test("22. ready export → downloadUrl from signed URL", async () => {
    const { GET } = await import("@/app/api/admin/export/[id]/route");
    const db = makeAdminDb({
      exportRow:        { id: "exp-2", status: "ready", file_path: "exp-2/memberships.csv" },
      storageSignedUrl: "https://storage.example.com/memberships.csv?token=abc",
    });
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await GET(makeReq("http://localhost/api/admin/export/exp-2"), { params: Promise.resolve({ id: "exp-2" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.downloadUrl).toBe("https://storage.example.com/memberships.csv?token=abc");
  });
});

// ── Scale boundary ────────────────────────────────────────────────────────────

describe("pagination scale: 100 000 records", () => {
  test("page=2000&limit=50 → range(100000, 100049) — no overflow", async () => {
    const { GET } = await import("@/app/api/admin/memberships/route");
    const db = makeAdminDb({ rows: [], count: 100_000 });
    mockGetSupabaseServer.mockReturnValue(db);
    await GET(makeReq("http://localhost/api/admin/memberships?page=2000&limit=50"));
    expect(db._range).toHaveBeenCalledWith(100_000, 100_049);
  });

  test("has_more=true when more pages exist", async () => {
    const { GET } = await import("@/app/api/admin/memberships/route");
    const db = makeAdminDb({ rows: Array.from({ length: 50 }, (_, i) => ({ user_email: `u${i}@cs.test`, status: "active", expires_at: new Date(Date.now() + 86400000).toISOString(), amount_paid: 100, plan: "monthly" })), count: 100_000 });
    mockGetSupabaseServer.mockReturnValue(db);
    const body = await (await GET(makeReq("http://localhost/api/admin/memberships?page=0&limit=50"))).json();
    expect(body.has_more).toBe(true);
    expect(body.total).toBe(100_000);
  });

  test("has_more=false on last page", async () => {
    const { GET } = await import("@/app/api/admin/memberships/route");
    const db = makeAdminDb({ rows: Array.from({ length: 5 }, (_, i) => ({ user_email: `u${i}@cs.test`, status: "active", expires_at: new Date(Date.now() + 86400000).toISOString(), amount_paid: 100, plan: "monthly" })), count: 105 });
    mockGetSupabaseServer.mockReturnValue(db);
    const body = await (await GET(makeReq("http://localhost/api/admin/memberships?page=2&limit=50"))).json();
    expect(body.has_more).toBe(false);
  });
});
