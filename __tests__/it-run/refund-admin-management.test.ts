/**
 * Refund management: refundable balance, reconciliation safety, and admin-only access
 * to the new summary, detail, and reconcile endpoints.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({
  requireRole: jest.fn(),
  getClientIp: () => "203.0.113.5",
}));
jest.mock("@/lib/razorpay-client", () => {
  class RazorpayApiError extends Error {
    constructor(public readonly status: number, message: string) { super(message); this.name = "RazorpayApiError"; }
  }
  return { createRefund: jest.fn(), listRefundsForPayment: jest.fn(), RazorpayApiError };
});

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";
import { listRefundsForPayment } from "@/lib/razorpay-client";
import { computeRefundableBreakdown, reconcileRefund } from "@/lib/it-run-refunds";
import { GET as summaryGet } from "@/app/api/it-run/admin/refund-requests/summary/route";
import { GET as detailGet } from "@/app/api/it-run/admin/refund-requests/[id]/route";
import { POST as reconcilePost } from "@/app/api/it-run/admin/refund-requests/[id]/reconcile/route";

const mockDb = getSupabaseServer as jest.Mock;
const mockRole = requireRole as jest.Mock;
const mockList = listRefundsForPayment as jest.Mock;

beforeEach(() => jest.clearAllMocks());

// ── Refundable balance ─────────────────────────────────────────────────────────

describe("computeRefundableBreakdown", () => {
  it("counts confirmed refunds as refunded and pending ones as in flight", () => {
    const b = computeRefundableBreakdown(100000, [
      { status: "processed", amount_paise: 30000 },
      { status: "pending", amount_paise: 20000 },
      { status: "failed", amount_paise: 50000 },
    ]);
    expect(b).toEqual({ refundedPaise: 30000, inFlightPaise: 20000, finalPricePaise: 100000, remainingPaise: 50000 });
  });

  it("ignores failed attempts so they do not reduce the refundable balance", () => {
    const b = computeRefundableBreakdown(100000, [{ status: "failed", amount_paise: 100000 }]);
    expect(b.remainingPaise).toBe(100000);
  });

  it("never reports a negative remaining balance", () => {
    const b = computeRefundableBreakdown(100000, [{ status: "processed", amount_paise: 150000 }]);
    expect(b.remainingPaise).toBe(0);
  });

  it("is zero for a free registration", () => {
    expect(computeRefundableBreakdown(0, []).remainingPaise).toBe(0);
  });
});

// ── Reconciliation safety ──────────────────────────────────────────────────────

function recordingDb() {
  const updates: Array<{ table: string; payload: any }> = [];
  const db = {
    from(table: string) {
      const b: any = {
        update(payload: unknown) { updates.push({ table, payload }); return b; },
        insert() { return Promise.resolve({ data: null, error: null }); },
        eq() { return b; },
        select() { return b; },
        maybeSingle() { return Promise.resolve({ data: { id: "r1", registration_id: "reg-1", amount_paise: 1000 }, error: null }); },
        single() { return Promise.resolve({ data: { id: "reg-1", final_price: 1000, registration_status: "active", category_id: "c", participant_count: 1, coupon_id: null, registration_code: "ITR-1", event_id: "ev" }, error: null }); },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve({ data: [], error: null }).then(res, rej); },
      };
      return b;
    },
    rpc() { return Promise.resolve({ data: null, error: null }); },
  };
  return { db, updates };
}

describe("reconcileRefund", () => {
  const pending = { id: "r1", status: "pending", razorpay_refund_id: null, razorpay_payment_id: "pay_1" };

  it("never marks a refund failed when Razorpay has no record of it (prevents duplicate refunds)", async () => {
    mockList.mockResolvedValue([]);
    const { db, updates } = recordingDb();

    const outcome = await reconcileRefund(db as any, pending, "admin@x.com");

    expect(outcome.kind).toBe("still_pending");
    expect(updates.some(u => u.payload?.status === "failed")).toBe(false);
  });

  it("matches a refund by our local refund_record note when the Razorpay ID was never saved", async () => {
    mockList.mockResolvedValue([{ id: "rfnd_9", status: "pending", notes: { refund_record: "r1" } }]);
    const { db, updates } = recordingDb();

    const outcome = await reconcileRefund(db as any, pending, "admin@x.com");

    expect(outcome.kind).toBe("still_pending");
    // Saves the Razorpay ID so later checks match by ID
    expect(updates.some(u => u.payload?.razorpay_refund_id === "rfnd_9")).toBe(true);
  });

  it("marks failed only when Razorpay itself reports the refund as failed", async () => {
    mockList.mockResolvedValue([{ id: "rfnd_9", status: "failed", notes: { refund_record: "r1" } }]);
    const { db, updates } = recordingDb();

    const outcome = await reconcileRefund(db as any, pending, "admin@x.com");

    expect(outcome.kind).toBe("marked_failed");
    expect(updates.some(u => u.table === "it_run_refunds" && u.payload?.status === "failed")).toBe(true);
  });

  it("does nothing to a refund that is not pending", async () => {
    const { db } = recordingDb();
    const outcome = await reconcileRefund(db as any, { ...pending, status: "processed" }, "admin@x.com");
    expect(outcome.kind).toBe("no_change");
    expect(mockList).not.toHaveBeenCalled();
  });

  it("cannot check Razorpay without a payment ID and says so", async () => {
    const { db } = recordingDb();
    const outcome = await reconcileRefund(db as any, { ...pending, razorpay_payment_id: null }, "admin@x.com");
    expect(outcome.kind).toBe("still_pending");
    expect(mockList).not.toHaveBeenCalled();
  });
});

// ── Admin-only access to the new endpoints ─────────────────────────────────────

function req(url: string, method = "GET") {
  return new NextRequest(url, { method });
}

describe("refund management endpoints are admin-only", () => {
  beforeEach(() => {
    mockRole.mockReturnValue(null);
    mockDb.mockReturnValue({ from: jest.fn(() => { throw new Error("db must not be touched"); }) });
  });

  it("summary returns 401 without an authorized admin", async () => {
    const res = await summaryGet(req("http://t/api/it-run/admin/refund-requests/summary"));
    expect(res.status).toBe(401);
  });

  it("detail returns 401 without an authorized admin", async () => {
    const res = await detailGet(req("http://t/api/it-run/admin/refund-requests/r1"), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(401);
  });

  it("reconcile returns 401 without an authorized admin and never calls Razorpay", async () => {
    const res = await reconcilePost(req("http://t/api/it-run/admin/refund-requests/r1/reconcile", "POST"), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });
});
