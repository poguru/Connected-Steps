/**
 * IT Run refund safety.
 *
 * Covers:
 *  • Participant refund request: never calls Razorpay, never touches the registration,
 *    requires ownership, blocks duplicates.
 *  • Admin execution: requires auth, explicit confirm, an approved request, remaining amount,
 *    and the pending-row lock; Razorpay outcomes map to the right state.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake Supabase builder is intentionally loosely typed */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({
  requireRole: jest.fn(),
  getClientIp: () => "203.0.113.7",
}));
jest.mock("@/lib/admin-auth", () => ({
  verifyUserToken: jest.fn(),
  USER_SESSION_COOKIE: "cs_user_session",
}));
jest.mock("@/lib/razorpay-client", () => {
  class RazorpayApiError extends Error {
    constructor(public readonly status: number, message: string) {
      super(message);
      this.name = "RazorpayApiError";
    }
  }
  return { createRefund: jest.fn(), RazorpayApiError };
});
jest.mock("@/lib/it-run-email", () => ({ sendRefundConfirmationEmail: jest.fn().mockResolvedValue(undefined) }));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";
import { verifyUserToken } from "@/lib/admin-auth";
import { createRefund, RazorpayApiError } from "@/lib/razorpay-client";
import { POST as adminRefundPost } from "@/app/api/it-run/admin/refund/route";
import { POST as requestPost } from "@/app/api/it-run/refund-requests/route";

const mockDb       = getSupabaseServer as jest.Mock;
const mockRole     = requireRole as jest.Mock;
const mockUser     = verifyUserToken as jest.Mock;
const mockRazorpay = createRefund as jest.Mock;

// ── Minimal fake Supabase client ───────────────────────────────────────────────
// Each table handler receives the query state ({ op, payload, filters }) and returns { data, error }.

type Query = { table: string; op: string; payload?: any; filters: Record<string, unknown> };
type Result = { data: unknown; error: { code?: string; message: string } | null };
type Handler = (q: Query) => Result;

function fakeDb(handlers: Record<string, Handler>, rpc: Record<string, () => Result> = {}) {
  const calls: Query[] = [];
  const rpcCalls: string[] = [];

  const db = {
    from(table: string) {
      const q: Query = { table, op: "select", filters: {} };
      const b: any = {
        select() { return b; },
        insert(payload: unknown) { q.op = "insert"; q.payload = payload; return b; },
        update(payload: unknown) { q.op = "update"; q.payload = payload; return b; },
        eq(k: string, v: unknown) { q.filters[k] = v; return b; },
        in() { return b; },
        order() { return b; },
        limit() { return b; },
        not() { return b; },
        maybeSingle() { return run(); },
        single() { return run(); },
        then(res: (v: Result) => unknown, rej?: (e: unknown) => unknown) { return run().then(res, rej); },
      };
      function run() {
        calls.push({ ...q, filters: { ...q.filters } });
        const handler = handlers[table];
        const result = handler ? handler(q) : { data: null, error: null };
        return Promise.resolve(result);
      }
      return b;
    },
    rpc(name: string) {
      rpcCalls.push(name);
      return Promise.resolve((rpc[name] ?? (() => ({ data: null, error: null })))());
    },
  };

  return { db, calls, rpcCalls };
}

function req(url: string, body?: unknown, cookie?: string): NextRequest {
  return new NextRequest(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie: `cs_user_session=${cookie}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ADMIN = { email: "admin@example.com", role: "event_admin" };

const REG = {
  id: "reg-1",
  event_id: "ev-1",
  registration_code: "ITR-0001",
  razorpay_order_id: "order_1",
  razorpay_payment_id: "pay_1",
  final_price: 1000, // rupees, as stored on the registration (refund amounts are paise)
  payment_status: "paid",
  registration_status: "active",
  lead_email: "lead@example.com",
  category_id: "cat-1",
  participant_count: 1,
  coupon_id: null,
};

/** Builds handlers for the admin execution path. Overrides let each test change one piece. */
function adminHandlers(over: {
  reg?: Partial<typeof REG> | null;
  request?: { status: string; registration_id?: string } | null;
  priorRefunds?: Array<{ amount_paise: number; status: string }>;
  insertError?: { code?: string; message: string } | null;
} = {}) {
  const reg = over.reg === null ? null : { ...REG, ...(over.reg ?? {}) };
  const request = over.request === null ? null : {
    id: "req-1",
    registration_id: REG.id,
    status: "approved",
    ...(over.request ?? {}),
  };
  return {
    it_run_events: () => ({ data: { id: "ev-1" }, error: null }),
    it_run_registrations: (q: Query) => {
      if (q.op === "update") return { data: null, error: null };
      return { data: reg, error: null };
    },
    it_run_refund_requests: (q: Query) => {
      if (q.op === "update") return { data: { id: "req-1", registration_id: REG.id }, error: null };
      return { data: request, error: null };
    },
    it_run_refunds: (q: Query) => {
      if (q.op === "insert") {
        if (over.insertError) return { data: null, error: over.insertError };
        return { data: { id: "refund-1" }, error: null };
      }
      if (q.op === "update") return { data: { id: "refund-1", registration_id: REG.id, amount_paise: 100000 }, error: null };
      // The pending refund read by id (finalize, downgrade lookup)
      if (q.filters.id === "refund-1") {
        return { data: { id: "refund-1", registration_id: REG.id, amount_paise: 100000, status: "pending", metadata: { request_id: "req-1" } }, error: null };
      }
      return { data: over.priorRefunds ?? [], error: null };
    },
    it_run_refund_audit: () => ({ data: null, error: null }),
  } as Record<string, Handler>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRole.mockReturnValue(ADMIN);
  mockUser.mockReturnValue(null);
});

// ── Admin execution ────────────────────────────────────────────────────────────

describe("POST /api/it-run/admin/refund", () => {
  const body = { registration_id: REG.id, request_id: "req-1", confirm: true };

  it("returns 401 and never calls Razorpay when the caller is not an authorized admin", async () => {
    mockRole.mockReturnValue(null);
    mockDb.mockReturnValue(fakeDb(adminHandlers()).db);

    const res = await adminRefundPost(req("http://t/api/it-run/admin/refund", body));

    expect(res.status).toBe(401);
    expect(mockRazorpay).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation", async () => {
    mockDb.mockReturnValue(fakeDb(adminHandlers()).db);

    const res = await adminRefundPost(req("http://t/api/it-run/admin/refund", { ...body, confirm: false }));

    expect(res.status).toBe(400);
    expect(mockRazorpay).not.toHaveBeenCalled();
  });

  it("refuses to execute a request that is not approved", async () => {
    mockDb.mockReturnValue(fakeDb(adminHandlers({ request: { status: "requested" } })).db);

    const res = await adminRefundPost(req("http://t/api/it-run/admin/refund", body));

    expect(res.status).toBe(409);
    expect(mockRazorpay).not.toHaveBeenCalled();
  });

  it("refuses an approved request that belongs to another registration", async () => {
    mockDb.mockReturnValue(fakeDb(adminHandlers({ request: { status: "approved", registration_id: "other" } })).db);

    const res = await adminRefundPost(req("http://t/api/it-run/admin/refund", body));

    expect(res.status).toBe(404);
    expect(mockRazorpay).not.toHaveBeenCalled();
  });

  it("refuses free registrations", async () => {
    mockDb.mockReturnValue(fakeDb(adminHandlers({ reg: { final_price: 0, payment_status: "free" } })).db);

    const res = await adminRefundPost(req("http://t/api/it-run/admin/refund", body));

    expect(res.status).toBe(422);
    expect(mockRazorpay).not.toHaveBeenCalled();
  });

  it("refuses unpaid registrations", async () => {
    mockDb.mockReturnValue(fakeDb(adminHandlers({ reg: { payment_status: "pending" } })).db);

    const res = await adminRefundPost(req("http://t/api/it-run/admin/refund", body));

    expect(res.status).toBe(422);
    expect(mockRazorpay).not.toHaveBeenCalled();
  });

  it("refuses payments that are already fully refunded", async () => {
    mockDb.mockReturnValue(fakeDb(adminHandlers({
      priorRefunds: [{ amount_paise: 100000, status: "processed" }],
    })).db);

    const res = await adminRefundPost(req("http://t/api/it-run/admin/refund", body));

    expect(res.status).toBe(422);
    expect(mockRazorpay).not.toHaveBeenCalled();
  });

  it("refuses an amount above the remaining refundable balance (pending + processed count)", async () => {
    mockDb.mockReturnValue(fakeDb(adminHandlers({
      priorRefunds: [{ amount_paise: 60000, status: "pending" }],
    })).db);

    const res = await adminRefundPost(req("http://t/api/it-run/admin/refund", { ...body, amount_paise: 50000 }));

    expect(res.status).toBe(422);
    expect(mockRazorpay).not.toHaveBeenCalled();
  });

  it("returns 409 and never calls Razorpay when another refund is already pending (concurrency lock)", async () => {
    mockDb.mockReturnValue(fakeDb(adminHandlers({
      insertError: { code: "23505", message: "duplicate key value violates unique constraint" },
    })).db);

    const res = await adminRefundPost(req("http://t/api/it-run/admin/refund", body));

    expect(res.status).toBe(409);
    expect(mockRazorpay).not.toHaveBeenCalled();
  });

  it("marks the refund failed on a definitive Razorpay 4xx and keeps the request approved for retry", async () => {
    mockRazorpay.mockRejectedValue(new RazorpayApiError(400, "Razorpay refund API 400: bad request"));
    const { db, calls } = fakeDb(adminHandlers());
    mockDb.mockReturnValue(db);

    const res = await adminRefundPost(req("http://t/api/it-run/admin/refund", body));

    expect(res.status).toBe(502);
    const failedUpdate = calls.find(c => c.table === "it_run_refunds" && c.op === "update" && c.payload?.status === "failed");
    expect(failedUpdate).toBeDefined();
    // The request is never moved out of 'approved' by a failure
    expect(calls.some(c => c.table === "it_run_refund_requests" && c.op === "update" && c.payload?.status === "rejected")).toBe(false);
  });

  it("leaves the refund pending when the Razorpay outcome is unknown (network error), not failed", async () => {
    mockRazorpay.mockRejectedValue(new TypeError("fetch failed"));
    const { db, calls } = fakeDb(adminHandlers());
    mockDb.mockReturnValue(db);

    const res = await adminRefundPost(req("http://t/api/it-run/admin/refund", body));

    expect(res.status).toBe(202);
    expect(calls.some(c => c.table === "it_run_refunds" && c.op === "update" && c.payload?.status === "failed")).toBe(false);
  });

  it("issues the refund once with the remaining amount and finalizes on a processed response", async () => {
    mockRazorpay.mockResolvedValue({ id: "rfnd_1", status: "processed", amount: 100000 });
    const { db, calls } = fakeDb(adminHandlers());
    mockDb.mockReturnValue(db);

    const res = await adminRefundPost(req("http://t/api/it-run/admin/refund", body));

    expect(res.status).toBe(200);
    expect(mockRazorpay).toHaveBeenCalledTimes(1);
    expect(mockRazorpay.mock.calls[0][1].amount).toBe(100000);
    // Processed is written only with a guard that the refund was still pending
    const processed = calls.find(c => c.table === "it_run_refunds" && c.payload?.status === "processed");
    expect(processed?.filters).toMatchObject({ id: "refund-1", status: "pending" });
  });
});

// ── Participant request ────────────────────────────────────────────────────────

describe("POST /api/it-run/refund-requests", () => {
  const body = { registration_code: "itr-0001", reason: "I am unable to attend due to travel." };
  const ownReg = { id: "reg-1", event_id: "ev-1", registration_code: "ITR-0001", payment_status: "paid", registration_status: "active", final_price: 100000 };

  it("returns 401 without a participant session", async () => {
    mockUser.mockReturnValue(null);
    const { db, calls } = fakeDb({});
    mockDb.mockReturnValue(db);

    const res = await requestPost(req("http://t/api/it-run/refund-requests", body));

    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
    expect(mockRazorpay).not.toHaveBeenCalled();
  });

  it("returns 404 for a registration the caller does not own (no existence leak)", async () => {
    mockUser.mockReturnValue("someone@example.com");
    const { db, calls } = fakeDb({ it_run_registrations: () => ({ data: null, error: null }) });
    mockDb.mockReturnValue(db);

    const res = await requestPost(req("http://t/api/it-run/refund-requests", body, "token"));

    expect(res.status).toBe(404);
    expect(calls.some(c => c.table === "it_run_refund_requests")).toBe(false);
  });

  it("creates a 'requested' row only; no Razorpay call and no registration change", async () => {
    mockUser.mockReturnValue("owner@example.com");
    const { db, calls } = fakeDb({
      it_run_registrations: () => ({ data: ownReg, error: null }),
      it_run_refund_requests: () => ({ data: { id: "req-9", status: "requested", created_at: "2026-10-09T00:00:00Z" }, error: null }),
    });
    mockDb.mockReturnValue(db);

    const res = await requestPost(req("http://t/api/it-run/refund-requests", body, "token"));

    expect(res.status).toBe(201);
    expect(mockRazorpay).not.toHaveBeenCalled();
    const insert = calls.find(c => c.table === "it_run_refund_requests" && c.op === "insert");
    expect(insert?.payload).toMatchObject({ status: "requested", requested_by_email: "owner@example.com", registration_id: "reg-1" });
    expect(calls.some(c => c.table === "it_run_registrations" && c.op === "update")).toBe(false);
    expect(calls.some(c => c.table === "it_run_refunds")).toBe(false);
  });

  it("returns 409 when an open request already exists (duplicate prevention)", async () => {
    mockUser.mockReturnValue("owner@example.com");
    const { db } = fakeDb({
      it_run_registrations: () => ({ data: ownReg, error: null }),
      it_run_refund_requests: () => ({ data: null, error: { code: "23505", message: "duplicate" } }),
    });
    mockDb.mockReturnValue(db);

    const res = await requestPost(req("http://t/api/it-run/refund-requests", body, "token"));

    expect(res.status).toBe(409);
    expect(mockRazorpay).not.toHaveBeenCalled();
  });

  it("refuses free or unpaid registrations", async () => {
    mockUser.mockReturnValue("owner@example.com");
    const { db } = fakeDb({
      it_run_registrations: () => ({ data: { ...ownReg, final_price: 0, payment_status: "free" }, error: null }),
    });
    mockDb.mockReturnValue(db);

    const res = await requestPost(req("http://t/api/it-run/refund-requests", body, "token"));

    expect(res.status).toBe(422);
  });

  it("rejects a reason that is too short", async () => {
    mockUser.mockReturnValue("owner@example.com");
    mockDb.mockReturnValue(fakeDb({}).db);

    const res = await requestPost(req("http://t/api/it-run/refund-requests", { registration_code: "ITR-0001", reason: "no" }, "token"));

    expect(res.status).toBe(400);
  });
});
