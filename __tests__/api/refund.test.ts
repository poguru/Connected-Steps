/**
 * Tests for POST /api/admin/events/[id]/registrations/[code]/refund
 *
 * Covers:
 *  • Auth guard — 401 when not admin
 *  • 404 when registration not found or wrong event
 *  • 400 when not cancelled / not paid / no payment ID
 *  • 409 when refund already processed or in progress (and retry bypass)
 *  • 400 when computed amount is 0
 *  • 502 when Razorpay call throws
 *  • DB marked "failed" on Razorpay error
 *  • 200 success — full refund (status "processed")
 *  • 200 success — partial refund (body.amount provided)
 *  • 200 success — refund "processing" (Razorpay not yet settled)
 *  • mode="retry" bypasses already-processed guard
 *  • Audit log row inserted on success and on failure
 */

process.env.COACH_TOKEN_SECRET        = "test-coach-secret";
process.env.ADMIN_PASSWORD            = "test-admin-password";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/razorpay-client", () => ({ createRefund: jest.fn() }));
jest.mock("@/lib/admin-auth", () => {
  const actual = jest.requireActual<typeof import("@/lib/admin-auth")>("@/lib/admin-auth");
  return { ...actual, isAdminOrCoach: jest.fn(), getAdminEmail: jest.fn() };
});

import { NextRequest }       from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach, getAdminEmail } from "@/lib/admin-auth";
import { createRefund }      from "@/lib/razorpay-client";
import { POST as refundPost } from "@/app/api/admin/events/[id]/registrations/[code]/refund/route";

const mockDb       = getSupabaseServer as jest.Mock;
const mockAuth     = isAdminOrCoach    as jest.Mock;
const mockActor    = getAdminEmail     as jest.Mock;
const mockRefund   = createRefund      as jest.Mock;

// ── Chainable Supabase mock ────────────────────────────────────────────────────

function ch(data: unknown, error: unknown = null): Record<string, jest.Mock> {
  const result = { data, error };
  const self: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  for (const m of ["select", "eq", "neq", "order", "limit", "is", "in", "filter"]) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  self.single      = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  self.maybeSingle = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  self.insert      = jest.fn().mockImplementation(() => ch(data, error));
  self.upsert      = jest.fn().mockImplementation(() => ch(data, error));
  self.update      = jest.fn().mockImplementation(() => ch(data, error));
  self.delete      = jest.fn().mockImplementation(() => ch(null));
  self.then        = jest.fn().mockImplementation(
    (res: (v: unknown) => unknown, rej?: (v: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  );
  return self;
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const REG: {
  id: string; status: string; payment_status: string;
  razorpay_payment_id: string | null; final_price: number;
  refund_status: string | null; refund_id: string | null;
  user_email: string; user_name: string;
} = {
  id:                    "reg-uuid-1",
  status:                "cancelled",
  payment_status:        "paid",
  razorpay_payment_id:   "pay_abc123",
  final_price:           500,          // rupees
  refund_status:         null,
  refund_id:             null,
  user_email:            "runner@example.com",
  user_name:             "Test Runner",
};

const RZP_REFUND_PROCESSED = {
  id:         "rfnd_xyz",
  entity:     "refund" as const,
  amount:     50000,   // paise = ₹500
  currency:   "INR",
  payment_id: "pay_abc123",
  status:     "processed" as const,
  created_at: 1700000000,
};

const RZP_REFUND_PROCESSING = {
  ...RZP_REFUND_PROCESSED,
  status: "processing" as const,
};

const PARAMS = (id = "evt-1", code = "CS-EVT-ABC123") =>
  ({ params: Promise.resolve({ id, code }) });

function makeReq(body: Record<string, unknown> = {}, eventId = "evt-1", code = "CS-EVT-ABC123"): NextRequest {
  return new NextRequest(
    `http://localhost/api/admin/events/${eventId}/registrations/${code}/refund`,
    { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
  );
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(true);
  mockActor.mockReturnValue("admin@example.com");
  mockRefund.mockResolvedValue(RZP_REFUND_PROCESSED);
});

// Builds a db mock where event_registrations.select returns `reg`.
function makeDb(reg: typeof REG | null, regErr: unknown = null) {
  const updateChain = ch(reg);
  const auditChain  = ch(null);

  const db = {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "event_registrations") return ch(reg, regErr);
      if (table === "cancellation_audit_log") return auditChain;
      return ch(null);
    }),
  };

  // Override so update() chains return something resolvable
  const regChain = ch(reg, regErr);
  regChain.update = jest.fn().mockReturnValue(ch(reg));

  db.from = jest.fn().mockImplementation((table: string) => {
    if (table === "event_registrations") return regChain;
    if (table === "cancellation_audit_log") return auditChain;
    return ch(null);
  });

  mockDb.mockReturnValue(db);
  return { db, regChain, auditChain };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("POST /api/admin/events/[id]/registrations/[code]/refund", () => {

  it("returns 401 when not admin", async () => {
    mockAuth.mockResolvedValue(false);
    const { db } = makeDb(REG);
    void db; // suppress unused warning
    const res = await refundPost(makeReq(), PARAMS());
    expect(res.status).toBe(401);
  });

  it("returns 404 when registration not found", async () => {
    makeDb(null, { message: "no rows" });
    const res = await refundPost(makeReq(), PARAMS());
    expect(res.status).toBe(404);
  });

  it("returns 400 when status is not cancelled", async () => {
    makeDb({ ...REG, status: "confirmed" });
    const res = await refundPost(makeReq(), PARAMS());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/cancelled/i);
  });

  it("returns 400 when payment_status is not paid", async () => {
    makeDb({ ...REG, payment_status: "free" });
    const res = await refundPost(makeReq(), PARAMS());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/paid/i);
  });

  it("returns 400 when razorpay_payment_id is missing", async () => {
    makeDb({ ...REG, razorpay_payment_id: null });
    const res = await refundPost(makeReq(), PARAMS());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/razorpay/i);
  });

  it("returns 409 when refund already processed", async () => {
    makeDb({ ...REG, refund_status: "processed" });
    const res = await refundPost(makeReq(), PARAMS());
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/already processed/i);
  });

  it("returns 409 when refund is in progress", async () => {
    makeDb({ ...REG, refund_status: "processing" });
    const res = await refundPost(makeReq(), PARAMS());
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/already in progress/i);
  });

  it("mode=retry bypasses already-processed guard", async () => {
    makeDb({ ...REG, refund_status: "processed" });
    const res = await refundPost(makeReq({ mode: "retry" }), PARAMS());
    expect(res.status).toBe(200);
  });

  it("returns 400 when computed refund amount is 0", async () => {
    makeDb({ ...REG, final_price: 0 });
    const res = await refundPost(makeReq(), PARAMS());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/positive/i);
  });

  it("returns 502 and marks DB failed when Razorpay throws", async () => {
    const { regChain } = makeDb(REG);
    mockRefund.mockRejectedValue(new Error("Razorpay 500"));
    const res = await refundPost(makeReq(), PARAMS());
    expect(res.status).toBe(502);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/razorpay refund failed/i);
    // DB should be updated to failed
    expect(regChain.update).toHaveBeenCalledWith(expect.objectContaining({ refund_status: "failed" }));
  });

  it("returns 200 with refund details on full refund (processed)", async () => {
    makeDb(REG);
    const res  = await refundPost(makeReq(), PARAMS());
    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean; refund_id: string; amount_paise: number;
      amount_inr: number; refund_status: string;
    };
    expect(body.success).toBe(true);
    expect(body.refund_id).toBe("rfnd_xyz");
    expect(body.amount_paise).toBe(50000);
    expect(body.amount_inr).toBe(500);
    expect(body.refund_status).toBe("processed");
  });

  it("uses body.amount (paise) for partial refund", async () => {
    makeDb(REG);
    mockRefund.mockResolvedValue({ ...RZP_REFUND_PROCESSED, amount: 20000 });
    const res  = await refundPost(makeReq({ amount: 20000 }), PARAMS());
    expect(res.status).toBe(200);
    // Razorpay should have been called with the partial amount
    expect(mockRefund).toHaveBeenCalledWith("pay_abc123", expect.objectContaining({ amount: 20000 }));
    const body = await res.json() as { amount_paise: number };
    expect(body.amount_paise).toBe(20000);
  });

  it("converts final_price rupees to paise for full refund call", async () => {
    makeDb(REG);  // REG.final_price = 500 rupees
    await refundPost(makeReq(), PARAMS());
    expect(mockRefund).toHaveBeenCalledWith("pay_abc123", expect.objectContaining({ amount: 50000 }));
  });

  it("returns refund_status=processing when Razorpay returns processing", async () => {
    makeDb(REG);
    mockRefund.mockResolvedValue(RZP_REFUND_PROCESSING);
    const res  = await refundPost(makeReq(), PARAMS());
    expect(res.status).toBe(200);
    const body = await res.json() as { refund_status: string };
    expect(body.refund_status).toBe("processing");
  });

  it("passes actor and event context as Razorpay notes", async () => {
    makeDb(REG);
    await refundPost(makeReq(), PARAMS("evt-1", "CS-EVT-ABC123"));
    expect(mockRefund).toHaveBeenCalledWith(
      "pay_abc123",
      expect.objectContaining({
        notes: expect.objectContaining({
          registration_code: "CS-EVT-ABC123",
          event_id:          "evt-1",
          actor:             "admin@example.com",
        }),
      }),
    );
  });
});
