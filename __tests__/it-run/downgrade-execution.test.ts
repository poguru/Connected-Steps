/**
 * Downgrade execution: an approved downgrade refunds the approved amount, reserves the target seats before
 * money moves, releases them if the refund fails, and moves the registration to the target category only
 * once the refund is processed. A partial downgrade refund never cancels the registration.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({
  requireRole: jest.fn(),
  getClientIp: () => "203.0.113.5",
}));
jest.mock("@/lib/razorpay-client", () => {
  class RazorpayApiError extends Error { status: number; constructor(m: string, s: number) { super(m); this.status = s; } }
  return {
    createRefund: jest.fn(),
    listRefundsForPayment: jest.fn().mockResolvedValue([]),
    RazorpayApiError,
  };
});
jest.mock("@/lib/it-run-email", () => ({ sendRefundConfirmationEmail: jest.fn().mockResolvedValue(undefined) }));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";
import { createRefund } from "@/lib/razorpay-client";
import { POST as adminRefundPost } from "@/app/api/it-run/admin/refund/route";
import { finalizeRefundProcessed, markRefundFailed, paidAmountPaise } from "@/lib/it-run-refunds";

const mockDb = getSupabaseServer as jest.Mock;
const mockRole = requireRole as jest.Mock;
const mockRazorpay = createRefund as jest.Mock;

const ADMIN = { email: "admin@example.com", role: "event_admin" };

// Asha paid ₹799 for the 10K and downgrades to the 5K at ₹499, so the approved refund is ₹300.
const REG = {
  id: "reg-1", event_id: "ev-1", registration_code: "ITR-AAA", razorpay_order_id: "order_1", razorpay_payment_id: "pay_1",
  final_price: 799, amount_paid_paise: null, category_id: "cat-10k", participant_count: 1,
  payment_status: "paid", registration_status: "active", lead_email: "asha@example.com",
};
const REQUEST = {
  id: "req-1", registration_id: "reg-1", status: "approved",
  request_kind: "downgrade", requested_amount_paise: 30000, target_category_id: "cat-5k",
};
const TARGET = { id: "cat-5k", name: "5K Timed Run", category_type: "solo", price_rupees: 499, is_active: true, event_id: "ev-1" };

type Q = { table: string; op: string; payload?: any; filters: Record<string, unknown> };

/** Fake Supabase: handlers answer single reads (maybeSingle/single) and list reads (awaited directly). */
function fakeDb(h: {
  reg?: any; request?: any; target?: any; refunds?: any[];
  pendingRefund?: any; reserve?: string; insertError?: any;
}) {
  const calls: Q[] = [];
  const rpcCalls: Array<{ name: string; args: any }> = [];
  const answer = (q: Q): any => {
    calls.push({ ...q, filters: { ...q.filters } });
    const t = q.table;
    if (t === "it_run_events") return { data: { id: "ev-1" }, error: null };
    if (t === "it_run_registrations") return q.op === "update" ? { data: null, error: null } : { data: h.reg === undefined ? REG : h.reg, error: null };
    if (t === "it_run_refund_requests") return q.op === "update" ? { data: { id: "req-1" }, error: null } : { data: h.request === undefined ? REQUEST : h.request, error: null };
    if (t === "it_run_categories") return { data: h.target === undefined ? TARGET : h.target, error: null };
    if (t === "it_run_refunds") {
      if (q.op === "insert") return h.insertError ? { data: null, error: h.insertError } : { data: { id: "refund-1" }, error: null };
      if (q.op === "update") return { data: { id: "refund-1", registration_id: "reg-1", amount_paise: 30000 }, error: null };
      if (q.filters.id === "refund-1") return { data: h.pendingRefund ?? { id: "refund-1", registration_id: "reg-1", amount_paise: 30000, status: "pending", metadata: { request_id: "req-1" } }, error: null };
      return { data: h.refunds ?? [], error: null };
    }
    return { data: null, error: null };
  };
  return {
    calls,
    rpcCalls,
    rpc(name: string, args: any) {
      rpcCalls.push({ name, args });
      if (name === "itr_reserve_capacity") return Promise.resolve({ data: h.reserve ?? "confirmed", error: null });
      return Promise.resolve({ data: null, error: null });
    },
    from(table: string) {
      const q: Q = { table, op: "select", filters: {} };
      const b: any = {
        select() { return b; },
        insert(payload: unknown) { q.op = "insert"; q.payload = payload; return b; },
        update(payload: unknown) { q.op = "update"; q.payload = payload; return b; },
        eq(k: string, v: unknown) { q.filters[k] = v; return b; },
        in() { return b; },
        order() { return b; },
        maybeSingle() { return Promise.resolve(answer(q)); },
        single() { return Promise.resolve(answer(q)); },
        then(res: any, rej?: any) { return Promise.resolve(answer(q)).then(res, rej); },
      };
      return b;
    },
  };
}

function req(body: unknown) {
  return new NextRequest("http://t/api/it-run/admin/refund", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

const BODY = { registration_id: "reg-1", request_id: "req-1", confirm: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockRole.mockReturnValue(ADMIN);
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

// ── Admin route: starting the downgrade refund ─────────────────────────────────

describe("admin refund route for a downgrade", () => {
  it("reserves the target seats, then refunds exactly the approved amount", async () => {
    mockRazorpay.mockResolvedValue({ id: "rfnd_1", status: "pending" });
    const db = fakeDb({});
    mockDb.mockReturnValue(db);

    const res = await adminRefundPost(req(BODY));

    expect(res.status).toBe(200);
    expect(db.rpcCalls).toContainEqual({ name: "itr_reserve_capacity", args: { p_category_id: "cat-5k", p_increment: 1 } });
    expect(mockRazorpay).toHaveBeenCalledTimes(1);
    expect(mockRazorpay.mock.calls[0][1].amount).toBe(30000);
  });

  it("refuses when the target is full: nothing is refunded and no refund row is created", async () => {
    mockDb.mockReturnValue(fakeDb({ reserve: "full" }));
    const res = await adminRefundPost(req(BODY));
    expect(res.status).toBe(409);
    expect(mockRazorpay).not.toHaveBeenCalled();
  });

  it("refuses when the target price has changed since the request, before reserving any seats", async () => {
    const db = fakeDb({ target: { ...TARGET, price_rupees: 599 } });
    mockDb.mockReturnValue(db);
    const res = await adminRefundPost(req(BODY));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/price has changed/);
    expect(db.rpcCalls.some(c => c.name === "itr_reserve_capacity")).toBe(false);
    expect(mockRazorpay).not.toHaveBeenCalled();
  });

  it("refuses a different amount than the approved request", async () => {
    mockDb.mockReturnValue(fakeDb({}));
    const res = await adminRefundPost(req({ ...BODY, amount_paise: 50000 }));
    expect(res.status).toBe(422);
    expect(mockRazorpay).not.toHaveBeenCalled();
  });

  it("refuses a target that no longer fits the group size", async () => {
    mockDb.mockReturnValue(fakeDb({ target: { ...TARGET, category_type: "duo" } }));
    const res = await adminRefundPost(req(BODY));
    expect(res.status).toBe(409);
    expect(mockRazorpay).not.toHaveBeenCalled();
  });

  it("gives the reserved seats back if the refund row cannot be created", async () => {
    const db = fakeDb({ insertError: { code: "XX000", message: "boom" } });
    mockDb.mockReturnValue(db);
    const res = await adminRefundPost(req(BODY));
    expect(res.status).toBe(500);
    expect(db.rpcCalls).toContainEqual({ name: "itr_release_capacity", args: { p_category_id: "cat-5k", p_count: 1 } });
    expect(mockRazorpay).not.toHaveBeenCalled();
  });
});

// ── Finalize: moving the registration once the partial refund is processed ─────

describe("finalizing a downgrade refund", () => {
  it("moves the registration to the target category, keeps the original paid amount, and releases the old seats", async () => {
    mockRazorpay.mockResolvedValue(undefined);
    const db = fakeDb({ refunds: [{ amount_paise: 30000, status: "processed" }] });
    mockDb.mockReturnValue(db);

    const done = await finalizeRefundProcessed(db as any, "refund-1", "rfnd_1", "razorpay-webhook");

    expect(done).toBe(true);
    const regUpdate = db.calls.find(c => c.table === "it_run_registrations" && c.op === "update")?.payload;
    expect(regUpdate).toMatchObject({
      category_id: "cat-5k",
      base_price: 499,
      final_price: 499,
      discount_amount: 0,
      amount_paid_paise: 79900,
      payment_status: "partially_refunded",
    });
    expect(regUpdate.registration_status).toBeUndefined();
    expect(db.rpcCalls).toContainEqual({ name: "itr_release_capacity", args: { p_category_id: "cat-10k", p_count: 1 } });
  });

  it("does not cancel the registration for a partial downgrade refund", async () => {
    const db = fakeDb({ refunds: [{ amount_paise: 30000, status: "processed" }] });
    mockDb.mockReturnValue(db);
    await finalizeRefundProcessed(db as any, "refund-1", "rfnd_1", "razorpay-webhook");
    const regUpdate = db.calls.find(c => c.table === "it_run_registrations" && c.op === "update")?.payload;
    expect(regUpdate.registration_status).toBeUndefined();
    expect(regUpdate.cancelled_reason).toBeUndefined();
  });

  it("refuses to process when the stored amount no longer matches the target price, and takes no lock", async () => {
    const db = fakeDb({ target: { ...TARGET, price_rupees: 599 } });
    mockDb.mockReturnValue(db);
    await expect(finalizeRefundProcessed(db as any, "refund-1", "rfnd_1", "razorpay-webhook")).rejects.toThrow(/no longer matches/);
    expect(db.calls.some(c => c.table === "it_run_refunds" && c.op === "update" && c.payload?.status === "processed")).toBe(false);
  });
});

// ── Failure: a refund that does not go through gives the seats back ────────────

describe("a failed downgrade refund", () => {
  it("releases the seats reserved for the target category", async () => {
    const db = fakeDb({});
    mockDb.mockReturnValue(db);
    const ok = await markRefundFailed(db as any, "refund-1", "Razorpay reports failed", "razorpay-webhook");
    expect(ok).toBe(true);
    expect(db.rpcCalls).toContainEqual({ name: "itr_release_capacity", args: { p_category_id: "cat-5k", p_count: 1 } });
  });
});

// ── Paid amount ────────────────────────────────────────────────────────────────

describe("paidAmountPaise", () => {
  it("is the stored original amount after a downgrade, and final price times 100 before one", () => {
    expect(paidAmountPaise({ final_price: 499, amount_paid_paise: 79900 })).toBe(79900);
    expect(paidAmountPaise({ final_price: 799, amount_paid_paise: null })).toBe(79900);
  });
});
