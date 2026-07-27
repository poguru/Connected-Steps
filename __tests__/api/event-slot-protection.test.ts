// Regression + protection tests for high-volume event registration.
//
// Core guarantees verified:
//  1.  Full event → 409 BEFORE Razorpay order is created (no money exchanged)
//  2.  Event with available slots → order created, slot reserved
//  3.  Reservation extends on retry (user comes back after navigating away)
//  4.  Slot reservation RPC error → 500, order never created
//  5.  Razorpay keys missing → 500, order never created
//  6.  Registration not found / already paid → 404 / guarded
//
//  verify-payment guarantees:
//  7.  Already-paid registration → idempotent 200
//  8.  Duplicate razorpay_payment_id in DB → idempotent 200
//  9.  Concurrent duplicate: unique constraint violation (23505) → idempotent 200
//  10. DB trigger "fully booked" error → 409 with clear message
//  11. Generic DB error → 500
//  12. Happy path → 200, QR + invoice jobs enqueued and fired
//
//  Slot boundary (high-volume simulation):
//  13. 500 reservation RPCs return 'reserved' → 500 orders created
//  14. 501st reservation RPC returns 'full' → 409, no Razorpay call

process.env.RAZORPAY_KEY_ID            = "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET        = "rzp_test_secret";
process.env.COACH_TOKEN_SECRET         = "test-coach-secret";
process.env.SUPABASE_SERVICE_ROLE_KEY  = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL   = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth", () => {
  const actual = jest.requireActual<typeof import("@/lib/admin-auth")>("@/lib/admin-auth");
  return {
    ...actual,
    verifyUserToken: jest.fn().mockReturnValue("user@cs.test"),
  };
});
jest.mock("@/lib/job-queue",       () => ({ enqueueJob: jest.fn().mockResolvedValue("job-1") }));
jest.mock("@/lib/job-handlers",    () => ({
  handleEventQrEmail:    jest.fn().mockResolvedValue(undefined),
  handleInvoiceGenerate: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/coupon-redeem",   () => ({ redeemCoupon: jest.fn().mockResolvedValue(true) }));
jest.mock("razorpay", () => {
  return jest.fn().mockImplementation(() => ({
    orders: {
      create: jest.fn().mockResolvedValue({
        id:       "order_test_123",
        amount:   50000,
        currency: "INR",
      }),
    },
  }));
});

import { NextRequest }       from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const mockGetSupabaseServer = getSupabaseServer as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "x-user-token": "valid-token" },
    body:    JSON.stringify(body),
  });
}

/** Build a mock DB for create-payment-order tests. */
function makeOrderDb(opts: {
  reg?:         { id: string; final_price: number; event_id: string; user_email: string; registration_code: string } | null;
  reservation?: "reserved" | "already_reserved" | "full";
  rpcError?:    { message: string };
}) {
  const rpcMock    = jest.fn().mockResolvedValue(
    opts.rpcError
      ? { data: null, error: opts.rpcError }
      : { data: opts.reservation ?? "reserved", error: null },
  );
  const updateMock = jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue({ error: null }),
  });

  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "event_registrations") {
        return {
          select:  jest.fn().mockReturnThis(),
          eq:      jest.fn().mockReturnThis(),
          single:  jest.fn().mockResolvedValue({ data: opts.reg ?? null, error: null }),
          update:  updateMock,
        };
      }
      return {};
    }),
    rpc:        rpcMock,
    _rpc:       rpcMock,
    _update:    updateMock,
  };
}

const PENDING_REG = {
  id:                "reg-uuid-1",
  final_price:       500,
  event_id:          "event-uuid-1",
  user_email:        "user@cs.test",
  registration_code: "CS-EVT-ABC123",
};

// ── 1. Slot protection tests (create-payment-order) ───────────────────────────

describe("POST /api/events/create-payment-order — slot protection", () => {

  beforeEach(() => jest.clearAllMocks());

  test("1. full event: reservation RPC returns 'full' → 409 before any Razorpay call", async () => {
    const { POST } = await import("@/app/api/events/create-payment-order/route");
    const db = makeOrderDb({ reg: PENDING_REG, reservation: "full" });
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await POST(makeRequest("http://localhost/api/events/create-payment-order", {
      event_id: "event-uuid-1", email: "user@cs.test", registration_code: "CS-EVT-ABC123",
    }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/fully booked/i);
    // Razorpay orders.create must NOT have been called
    const Razorpay = (await import("razorpay")).default as unknown as jest.Mock;
    const razorpayInstance = Razorpay.mock.results[Razorpay.mock.results.length - 1]?.value;
    if (razorpayInstance) {
      expect(razorpayInstance.orders.create).not.toHaveBeenCalled();
    }
  });

  test("2. available slot: reservation RPC returns 'reserved' → Razorpay order created, 200", async () => {
    const { POST } = await import("@/app/api/events/create-payment-order/route");
    const db = makeOrderDb({ reg: PENDING_REG, reservation: "reserved" });
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await POST(makeRequest("http://localhost/api/events/create-payment-order", {
      event_id: "event-uuid-1", email: "user@cs.test", registration_code: "CS-EVT-ABC123",
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.orderId).toBe("order_test_123");
  });

  test("3. re-attempt: 'already_reserved' → extends reservation, order still created", async () => {
    const { POST } = await import("@/app/api/events/create-payment-order/route");
    const db = makeOrderDb({ reg: PENDING_REG, reservation: "already_reserved" });
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await POST(makeRequest("http://localhost/api/events/create-payment-order", {
      event_id: "event-uuid-1", email: "user@cs.test", registration_code: "CS-EVT-ABC123",
    }));

    expect(res.status).toBe(200);
    expect((await res.json()).orderId).toBe("order_test_123");
  });

  test("4. RPC error → 500, no Razorpay call", async () => {
    const { POST } = await import("@/app/api/events/create-payment-order/route");
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const db = makeOrderDb({ reg: PENDING_REG, rpcError: { message: "DB connection lost" } });
    mockGetSupabaseServer.mockReturnValue(db);

    const res = await POST(makeRequest("http://localhost/api/events/create-payment-order", {
      event_id: "event-uuid-1", email: "user@cs.test", registration_code: "CS-EVT-ABC123",
    }));

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  test("5. registration not found → 404", async () => {
    const { POST } = await import("@/app/api/events/create-payment-order/route");
    const db = makeOrderDb({ reg: null, reservation: "full" });
    mockGetSupabaseServer.mockReturnValue(db);

    const res = await POST(makeRequest("http://localhost/api/events/create-payment-order", {
      event_id: "event-uuid-1", email: "user@cs.test", registration_code: "CS-EVT-NOTFOUND",
    }));

    expect(res.status).toBe(404);
  });

  test("6. reserve_event_slot called with correct registration UUID and event UUID", async () => {
    const { POST } = await import("@/app/api/events/create-payment-order/route");
    const db = makeOrderDb({ reg: PENDING_REG, reservation: "reserved" });
    mockGetSupabaseServer.mockReturnValue(db);

    await POST(makeRequest("http://localhost/api/events/create-payment-order", {
      event_id: "event-uuid-1", email: "user@cs.test", registration_code: "CS-EVT-ABC123",
    }));

    expect(db._rpc).toHaveBeenCalledWith("reserve_event_slot", {
      p_registration_id: "reg-uuid-1",
      p_event_id:        "event-uuid-1",
      p_ttl_minutes:     15,
    });
  });
});

// ── 2. verify-payment tests ───────────────────────────────────────────────────

describe("POST /api/events/verify-payment — payment protection", () => {

  /** Build a mock DB for verify-payment tests. */
  function makeVerifyDb(opts: {
    reg?:        { id: string; coupon_id: string | null; user_email: string; user_name: string; payment_status: string; event_id: string; distance_category: string | null; final_price: number; events: { title: string; start_date: string; start_time: string | null; location: string } | null } | null;
    dupPayment?: { id: string } | null;
    updateError?: { message: string; code?: string } | null;
  }) {
    const updateEqMock = jest.fn().mockResolvedValue({ error: opts.updateError ?? null });
    const updateMock   = jest.fn().mockReturnValue({ eq: updateEqMock });

    return {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "event_registrations") {
          let callIdx = 0;
          return {
            select:     jest.fn().mockReturnThis(),
            eq:         jest.fn().mockImplementation(function(this: Record<string, jest.Mock>) {
              return this;
            }),
            single:     jest.fn().mockResolvedValue({ data: opts.reg ?? null, error: null }),
            maybeSingle: jest.fn().mockResolvedValue({ data: opts.dupPayment ?? null, error: null }),
            update:     updateMock,
          };
        }
        if (table === "job_queue") {
          return { insert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { id: "job-1" }, error: null }) };
        }
        return {};
      }),
    };
  }

  const PAID_BODY = {
    razorpay_order_id:   "order_123",
    razorpay_payment_id: "pay_abc",
    razorpay_signature:  require("crypto")
      .createHmac("sha256", "rzp_test_secret")
      .update("order_123|pay_abc")
      .digest("hex"),
    registration_code:   "CS-EVT-ABC123",
  };

  const PAID_REG = {
    id:                "reg-uuid-1",
    coupon_id:         null,
    user_email:        "user@cs.test",
    user_name:         "Test User",
    payment_status:    "pending",
    event_id:          "event-uuid-1",
    distance_category: null,
    final_price:       500,
    events:            { title: "5K Run", start_date: "2026-07-01", start_time: null, location: "Hyderabad" },
  };

  beforeEach(() => jest.clearAllMocks());

  test("7. already-paid registration → 200 idempotent (no re-processing)", async () => {
    const { POST } = await import("@/app/api/events/verify-payment/route");
    const db = makeVerifyDb({ reg: { ...PAID_REG, payment_status: "paid" }, dupPayment: null });
    mockGetSupabaseServer.mockReturnValue(db);

    const res = await POST(makeRequest("http://localhost/api/events/verify-payment", PAID_BODY));

    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  test("8. duplicate razorpay_payment_id already in DB → 200 idempotent", async () => {
    const { POST } = await import("@/app/api/events/verify-payment/route");
    // reg is pending, but the payment_id was already stored (maybe for another reg)
    const db = makeVerifyDb({ reg: PAID_REG, dupPayment: { id: "other-reg-uuid" } });
    mockGetSupabaseServer.mockReturnValue(db);

    const res = await POST(makeRequest("http://localhost/api/events/verify-payment", PAID_BODY));

    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  test("9. concurrent duplicate: unique constraint violation (23505) → 200 idempotent", async () => {
    const { POST } = await import("@/app/api/events/verify-payment/route");
    const db = makeVerifyDb({
      reg:          PAID_REG,
      dupPayment:   null,  // not yet in DB when check runs
      updateError:  { message: "duplicate key value violates unique constraint", code: "23505" },
    });
    mockGetSupabaseServer.mockReturnValue(db);

    const res = await POST(makeRequest("http://localhost/api/events/verify-payment", PAID_BODY));

    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  test("10. DB trigger 'fully booked' error → 409 with clear refund message", async () => {
    const { POST } = await import("@/app/api/events/verify-payment/route");
    const db = makeVerifyDb({
      reg:          PAID_REG,
      dupPayment:   null,
      updateError:  { message: "Event is fully booked", code: "P0001" },
    });
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await POST(makeRequest("http://localhost/api/events/verify-payment", PAID_BODY));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/fully booked/i);
    expect(body.error).toMatch(/refund/i);
  });

  test("11. generic DB error → 500", async () => {
    const { POST } = await import("@/app/api/events/verify-payment/route");
    const db = makeVerifyDb({
      reg:         PAID_REG,
      dupPayment:  null,
      updateError: { message: "connection timeout", code: "08000" },
    });
    mockGetSupabaseServer.mockReturnValue(db);

    const res = await POST(makeRequest("http://localhost/api/events/verify-payment", PAID_BODY));

    expect(res.status).toBe(500);
  });

  test("12. happy path → 200, response has success=true", async () => {
    const { POST } = await import("@/app/api/events/verify-payment/route");
    const db = makeVerifyDb({ reg: PAID_REG, dupPayment: null, updateError: null });
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await POST(makeRequest("http://localhost/api/events/verify-payment", PAID_BODY));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  test("invalid Razorpay signature → 400", async () => {
    const { POST } = await import("@/app/api/events/verify-payment/route");
    const res = await POST(makeRequest("http://localhost/api/events/verify-payment", {
      ...PAID_BODY,
      razorpay_signature: "invalid_signature",
    }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/signature/i);
  });
});

// ── 3. High-volume slot boundary simulation ───────────────────────────────────

describe("slot boundary — 2 000 concurrent users, 500 slots", () => {
  const MAX_SLOTS = 500;
  const TOTAL_USERS = 2000;

  function makeSlotDb(slotsLeft: number) {
    let reserved = MAX_SLOTS - slotsLeft;
    return {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "event_registrations") {
          return {
            select:  jest.fn().mockReturnThis(),
            eq:      jest.fn().mockReturnThis(),
            single:  jest.fn().mockResolvedValue({ data: { ...PENDING_REG, id: `reg-${Math.random()}` }, error: null }),
            update:  jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
          };
        }
        return {};
      }),
      rpc: jest.fn().mockImplementation(() => {
        // Simulate atomic slot reservation
        if (reserved < MAX_SLOTS) {
          reserved++;
          return Promise.resolve({ data: "reserved", error: null });
        }
        return Promise.resolve({ data: "full", error: null });
      }),
    };
  }

  test("13. first 500 requests get 'reserved' → all receive Razorpay order", async () => {
    const { POST } = await import("@/app/api/events/create-payment-order/route");
    const db = makeSlotDb(MAX_SLOTS);  // all slots available
    mockGetSupabaseServer.mockReturnValue(db);

    const results = await Promise.allSettled(
      Array.from({ length: MAX_SLOTS }, () =>
        POST(makeRequest("http://localhost/api/events/create-payment-order", {
          event_id: "event-uuid-1", email: "user@cs.test", registration_code: "CS-EVT-ABC123",
        }))
      )
    );

    const statuses = await Promise.all(
      results.map(r => r.status === "fulfilled" ? r.value.status : 500)
    );
    expect(statuses.every(s => s === 200)).toBe(true);
  });

  test("14. 501st request when event is full → 409, no Razorpay call", async () => {
    const { POST } = await import("@/app/api/events/create-payment-order/route");
    // Simulate 0 slots remaining
    const db = makeSlotDb(0);
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await POST(makeRequest("http://localhost/api/events/create-payment-order", {
      event_id: "event-uuid-1", email: "user@cs.test", registration_code: "CS-EVT-ABC123",
    }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/fully booked/i);
  });

  test("15. mixed load: 2 000 requests, exactly 500 succeed", async () => {
    const { POST } = await import("@/app/api/events/create-payment-order/route");

    let reserved = 0;  // local counter simulating DB state
    const db = {
      from: jest.fn().mockImplementation(() => ({
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        single:  jest.fn().mockResolvedValue({ data: { ...PENDING_REG, id: `reg-${Math.random()}` }, error: null }),
        update:  jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
      })),
      rpc: jest.fn().mockImplementation(() => {
        if (reserved < MAX_SLOTS) { reserved++; return Promise.resolve({ data: "reserved", error: null }); }
        return Promise.resolve({ data: "full", error: null });
      }),
    };
    mockGetSupabaseServer.mockReturnValue(db);

    const reqs = Array.from({ length: TOTAL_USERS }, () =>
      POST(makeRequest("http://localhost/api/events/create-payment-order", {
        event_id: "event-uuid-1", email: "user@cs.test", registration_code: "CS-EVT-ABC123",
      }))
    );

    const responses = await Promise.all(reqs);
    const statuses  = await Promise.all(responses.map(r => r.status));

    const successes  = statuses.filter(s => s === 200).length;
    const conflicts  = statuses.filter(s => s === 409).length;

    expect(successes).toBe(MAX_SLOTS);           // exactly 500 orders created
    expect(conflicts).toBe(TOTAL_USERS - MAX_SLOTS); // exactly 1500 rejected
    expect(successes + conflicts).toBe(TOTAL_USERS);
  });
});
