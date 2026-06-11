import crypto from "crypto";

process.env.RAZORPAY_KEY_SECRET = "test-razorpay-secret";
process.env.COACH_TOKEN_SECRET  = "test-coach-secret";
process.env.ADMIN_PASSWORD      = "test-admin-password";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/auto-feed", () => ({
  autoFeedMembershipActivated: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/notify", () => ({
  sendEmail:          jest.fn().mockResolvedValue(undefined),
  sendWhatsApp:       jest.fn().mockResolvedValue(undefined),
  paymentEmailHTML:   jest.fn().mockReturnValue(""),
  membershipWAParams: jest.fn().mockReturnValue([]),
}));

import { POST } from "@/app/api/payment/verify/route";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const mockGetSupabaseServer = getSupabaseServer as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sign(orderId: string, paymentId: string): string {
  return crypto
    .createHmac("sha256", "test-razorpay-secret")
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

interface PaymentPayload {
  razorpay_order_id:   string;
  razorpay_payment_id: string;
  razorpay_signature:  string;
  plan:                string;
  email:               string;
  name:                string;
  amount:              number;
  coupon_id?:          string;
}

function makeRequest(p: Omit<PaymentPayload, "razorpay_signature">): NextRequest {
  const body: PaymentPayload = {
    ...p,
    razorpay_signature: sign(p.razorpay_order_id, p.razorpay_payment_id),
  };
  return new NextRequest("http://localhost/api/payment/verify", {
    method:  "POST",
    body:    JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const BASE_PAYMENT = {
  razorpay_order_id:   "order_abc123",
  razorpay_payment_id: "pay_xyz789",
  plan:                "monthly",
  email:               "runner@example.com",
  name:                "Test Runner",
  amount:              120000,
} as const;

const STORED_EXPIRY = "2027-06-11T00:00:00.000Z";

// Builds a Supabase client mock.
// idempotencyResult: what the memberships SELECT returns (null = new payment, object = duplicate).
function makeDb(idempotencyResult: { expires_at: string } | null) {
  const upsertMock = jest.fn().mockResolvedValue({ error: null });

  // memberships is queried twice: once for SELECT (idempotency), once for upsert
  let membershipCallCount = 0;

  const dbMock = {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "memberships") {
        membershipCallCount++;
        if (membershipCallCount === 1) {
          // idempotency SELECT chain
          const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
          chain.select      = jest.fn().mockReturnValue(chain);
          chain.eq          = jest.fn().mockReturnValue(chain);
          chain.maybeSingle = jest.fn().mockResolvedValue({ data: idempotencyResult, error: null });
          return chain;
        }
        // upsert call
        return { upsert: upsertMock };
      }

      if (table === "users") {
        const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq     = jest.fn().mockReturnValue(chain);
        chain.single = jest.fn().mockResolvedValue({ data: { phone: null }, error: null });
        return chain;
      }

      // coupon_uses, coupons — not reached in these tests
      return { insert: jest.fn().mockResolvedValue({ error: null }) };
    }),
    rpc: jest.fn().mockResolvedValue({ error: null }),
    _upsertMock: upsertMock,
  };

  return dbMock;
}

beforeEach(() => jest.clearAllMocks());

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/payment/verify — idempotency", () => {

  test("new payment is processed normally", async () => {
    const db = makeDb(null); // no existing payment
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await POST(makeRequest(BASE_PAYMENT));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.expiresAt).toBeTruthy();
    // Upsert must have been called
    expect(db._upsertMock).toHaveBeenCalledTimes(1);
  });

  test("same payment processed twice — second call returns early without touching DB", async () => {
    // Second call: idempotency check finds existing record
    const db = makeDb({ expires_at: STORED_EXPIRY });
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await POST(makeRequest(BASE_PAYMENT));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // Returns the stored expiry — not a freshly computed one
    expect(body.expiresAt).toBe(STORED_EXPIRY);
    // Upsert must NOT have been called
    expect(db._upsertMock).not.toHaveBeenCalled();
  });

  test("duplicate payment does not resend notifications", async () => {
    const { autoFeedMembershipActivated } = await import("@/lib/auto-feed");
    const { sendEmail, sendWhatsApp }     = await import("@/lib/notify");

    const db = makeDb({ expires_at: STORED_EXPIRY });
    mockGetSupabaseServer.mockReturnValue(db);

    await POST(makeRequest(BASE_PAYMENT));

    expect(autoFeedMembershipActivated).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  test("same payment processed concurrently — both calls succeed without error", async () => {
    // Both calls see null (idempotency check before either has written)
    const db1 = makeDb(null);
    const db2 = makeDb(null);

    // Each call gets its own db instance (simulating two concurrent requests)
    mockGetSupabaseServer
      .mockReturnValueOnce(db1)
      .mockReturnValueOnce(db2);

    const [res1, res2] = await Promise.all([
      POST(makeRequest(BASE_PAYMENT)),
      POST(makeRequest({ ...BASE_PAYMENT, razorpay_payment_id: BASE_PAYMENT.razorpay_payment_id })),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    // Both proceeded through to upsert (concurrent; neither blocked the other)
    expect(db1._upsertMock).toHaveBeenCalledTimes(1);
    expect(db2._upsertMock).toHaveBeenCalledTimes(1);
  });

  test("different payment IDs are each processed independently", async () => {
    const paymentA = { ...BASE_PAYMENT, razorpay_payment_id: "pay_aaa111", razorpay_order_id: "order_aaa" };
    const paymentB = { ...BASE_PAYMENT, razorpay_payment_id: "pay_bbb222", razorpay_order_id: "order_bbb" };

    const dbA = makeDb(null);
    const dbB = makeDb(null);

    mockGetSupabaseServer
      .mockReturnValueOnce(dbA)
      .mockReturnValueOnce(dbB);

    const [resA, resB] = await Promise.all([
      POST(makeRequest(paymentA)),
      POST(makeRequest(paymentB)),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    // Both upserts happened independently
    expect(dbA._upsertMock).toHaveBeenCalledTimes(1);
    expect(dbB._upsertMock).toHaveBeenCalledTimes(1);
  });

  test("invalid signature is rejected before idempotency check", async () => {
    const db = makeDb(null);
    mockGetSupabaseServer.mockReturnValue(db);

    const req = new NextRequest("http://localhost/api/payment/verify", {
      method:  "POST",
      body:    JSON.stringify({ ...BASE_PAYMENT, razorpay_signature: "bad_signature" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    // DB was never queried — signature rejected before idempotency check
    expect(db.from).not.toHaveBeenCalled();
  });
});
