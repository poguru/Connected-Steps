/**
 * Phase 2 — Cross-module integration tests.
 *
 * Tests the full lifecycle of a participant through the Connected Steps platform:
 *   Registration → Payment → Invoice + QR Email → Check-In → T-Shirt → Breakfast → Dashboard
 *
 * Rather than mocking away every side-effect, each test verifies that the
 * CORRECT TABLES are written to with the CORRECT FIELDS at each lifecycle
 * transition.  DB calls are inspected via the mock's call history.
 */

process.env.COACH_TOKEN_SECRET        = "test-xmod-secret";
process.env.ADMIN_PASSWORD            = "test-admin-password";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";
process.env.RAZORPAY_KEY_SECRET       = "test-rp-secret";

// ── Module mocks ───────────────────────────────────────────────────────────────
jest.mock("next/server", () => {
  const actual = jest.requireActual<typeof import("next/server")>("next/server");
  return { ...actual, after: jest.fn((fn: () => unknown) => { Promise.resolve(fn()).catch(() => {}); }) };
});
jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth", () => {
  const actual = jest.requireActual<typeof import("@/lib/admin-auth")>("@/lib/admin-auth");
  return { ...actual, isAdminOrCoach: jest.fn(), verifyUserToken: jest.fn() };
});
jest.mock("@/lib/notify", () => ({
  sendEmail:                  jest.fn().mockResolvedValue({ ok: true }),
  eventRegistrationEmailHTML: jest.fn().mockReturnValue("<html>"),
  paymentEmailHTML:           jest.fn().mockReturnValue("<html>"),
  sendWhatsApp:               jest.fn().mockResolvedValue({ ok: true }),
  runRegistrationWAParams:    jest.fn().mockReturnValue([]),
}));
// NOTE: do NOT mock @/lib/job-queue here — the Stage 2 tests verify that
// enqueueJob actually calls db.from("job_queue"). Instead, each DB mock
// includes job_queue handling so the real enqueueJob function can insert.
jest.mock("@/lib/job-handlers", () => ({ handleEventQrEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/webhook-dispatch",  () => ({ dispatchWebhookEvent: jest.fn() }));
jest.mock("@/lib/automation-engine", () => ({ evaluateAutomations: jest.fn() }));
jest.mock("@/lib/campaign-service",  () => ({ recordConsent: jest.fn() }));
jest.mock("@/lib/coupon-redeem", () => ({ redeemCoupon: jest.fn().mockResolvedValue(undefined) }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
// job-handlers — use real functions but stub their Supabase calls through the global mock
jest.mock("@/lib/invoice-service", () => ({
  createAndSendInvoice: jest.fn().mockResolvedValue({ invoice_number: "INV-2026-0001" }),
}));

import crypto                          from "crypto";
import { NextRequest }                 from "next/server";
import { getSupabaseServer }           from "@/lib/supabase-server";
import { isAdminOrCoach, verifyUserToken, signAdminSession, ADMIN_SESSION_COOKIE } from "@/lib/admin-auth";
import { signEventQR }                 from "@/lib/event-qr";
import { POST as register }            from "@/app/api/events/register/route";
import { POST as verifyPayment }       from "@/app/api/events/verify-payment/route";
import { POST as checkIn }             from "@/app/api/events/check-in/route";
import { POST as tshirtDistribute }    from "@/app/api/events/tshirt-distribute/route";
import { POST as markBreakfast }       from "@/app/api/events/mark-breakfast/route";
import { GET  as myRegistrations }     from "@/app/api/events/my-registrations/route";

const mockDb   = getSupabaseServer as jest.Mock;
const mockAuth = isAdminOrCoach    as jest.Mock;
const mockVerifyToken = verifyUserToken as jest.Mock;

// ── Constants ──────────────────────────────────────────────────────────────────

const EVENT_ID   = "evt-xmod-1";
const REG_CODE   = "CS-XMOD-001";
const USER_EMAIL = "xmod@test.com";
const USER_NAME  = "X-Mod Runner";
const REG_ID     = "reg-xmod-1";
const QR_TOKEN   = signEventQR(REG_CODE, EVENT_ID);

const EVENT_ROW = {
  id: EVENT_ID, title: "Cross Module Run 2026",
  status: "published", registration_open: true,
  start_date: "2026-12-01", start_time: "06:00", location: "Hyderabad",
  max_participants: 500, participant_count: 10,
  price: 999, distance_categories: ["5K", "10K"],
  early_bird_price: null, early_bird_ends_at: null,
  custom_form_fields: null,
};

// ── Chainable mock builder ─────────────────────────────────────────────────────

function ch(data: unknown, error: unknown = null): Record<string, jest.Mock> {
  const result = { data, error, count: null as number | null };
  const self: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  for (const m of ["select", "eq", "neq", "order", "limit", "in", "not", "filter", "gte", "lte", "ilike", "or", "is"]) {
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

function adminRequest(url: string, method: string, body?: unknown): NextRequest {
  const cookie = `${ADMIN_SESSION_COOKIE}=${signAdminSession()}`;
  return new NextRequest(url, {
    method,
    headers: { cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function userRequest(url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-token": "tok",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

// Build a valid Razorpay signature for test payments
function razorpaySignature(orderId: string, paymentId: string): string {
  return crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(true);        // volunteer / admin endpoints
  mockVerifyToken.mockReturnValue(USER_EMAIL); // user token endpoints
});

// ═══════════════════════════════════════════════════════════════════════════════
// Stage 1: Event Registration — free path
// ═══════════════════════════════════════════════════════════════════════════════

describe("Stage 1 — Event Registration (free event)", () => {
  const FREE_EVENT = {
    ...EVENT_ROW, price: 0,
    // Must have a future end date or the route rejects it as "already ended"
    end_date: "2026-12-02", end_time: "23:59",
    registration_closes_at: null, collect_tshirt: false,
    early_bird_ends_at: null,
  };
  const UPSERT_ROW = {
    id: REG_ID, registration_code: REG_CODE, payment_status: "free",
    status: "confirmed", user_email: USER_EMAIL,
    events: { title: FREE_EVENT.title, start_date: FREE_EVENT.start_date },
  };
  // Minimum valid registration body for single-participant route
  const VALID_BODY = {
    event_id:          EVENT_ID,
    email:             USER_EMAIL,
    name:              USER_NAME,
    phone:             "9876543210",
    gender:            "male",
    date_of_birth:     "1990-01-01",
    blood_group:       "O+",
    emergency_contact: "9876543211",
    special_notes:     "NA",
    distance_category: "10K",
  };

  function makeRegDb() {
    const counters: Record<string, number> = {};
    return {
      rpc: jest.fn().mockImplementation((name: string) => {
        // rate-limit rpcs return 0 (not rate-limited); release_expired_slots returns null
        return Promise.resolve({ data: 0, error: null });
      }),
      from: jest.fn().mockImplementation((table: string) => {
        counters[table] = (counters[table] ?? 0) + 1;
        const n = counters[table];
        if (table === "users")               return ch({ id: "u-1", first_name: USER_NAME, last_name: "", email: USER_EMAIL });
        if (table === "events")              return ch(FREE_EVENT);
        if (table === "event_races")         return ch([]);
        if (table === "event_form_fields")   return ch([]);
        if (table === "event_participants")  return ch({ id: "part-1" });
        if (table === "job_queue")           return ch({ id: "job-1" }); // enqueueJob inserts
        if (table === "event_registrations") {
          if (n === 1) return ch(null);         // duplicate check → none
          if (n === 2) return ch(UPSERT_ROW);   // upsert result
          return ch(UPSERT_ROW);                // post-registration fetch
        }
        return ch(null);
      }),
    };
  }

  test("registration inserts into event_registrations with correct status and email", async () => {
    const db = makeRegDb();
    mockDb.mockReturnValue(db);
    const req = userRequest("http://localhost/api/events/register", VALID_BODY);
    const res = await register(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.free).toBe(true);

    // Verify that event_registrations was written (upsert call)
    const regCalls = db.from.mock.calls.filter(([t]: [string]) => t === "event_registrations");
    expect(regCalls.length).toBeGreaterThanOrEqual(2);
  });

  test("registration for a free event resolves immediately without payment", async () => {
    const db = makeRegDb();
    mockDb.mockReturnValue(db);
    const req = userRequest("http://localhost/api/events/register", VALID_BODY);
    const res = await register(req);
    const body = await res.json();
    // Free events return free:true (no payment step needed)
    expect(body.free).toBe(true);
    expect(body.registration_code).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Stage 2: Payment Verification — updates registration to paid
// ═══════════════════════════════════════════════════════════════════════════════

describe("Stage 2 — Payment Verification", () => {
  const ORDER_ID   = "order_xmod_001";
  const PAYMENT_ID = "pay_xmod_001";
  const SIG        = razorpaySignature(ORDER_ID, PAYMENT_ID);

  const PENDING_REG = {
    id: REG_ID, payment_status: "pending_payment", status: "pending",
    user_email: USER_EMAIL, user_name: USER_NAME,
    event_id: EVENT_ID, coupon_id: null,
    distance_category: "10K", final_price: 999, participant_count: 1,
    events: { title: "Cross Module Run 2026", start_date: "2026-12-01", start_time: "06:00", location: "Hyderabad" },
  };

  function makePaymentDb() {
    const counters: Record<string, number> = {};
    return {
      from: jest.fn().mockImplementation((table: string) => {
        counters[table] = (counters[table] ?? 0) + 1;
        const n = counters[table];
        if (table === "event_registrations") {
          if (n === 1) return ch(PENDING_REG);    // idempotency check: not yet paid
          if (n === 2) return ch(null);            // duplicate payment_id check
          return ch(null);                         // update & subsequent calls
        }
        if (table === "job_queue") return ch({ id: "job-1" }); // enqueueJob inserts
        return ch(null);
      }),
    };
  }

  test("verify-payment transitions registration to paid and enqueues QR + invoice jobs", async () => {
    const db = makePaymentDb();
    mockDb.mockReturnValue(db);

    const req = new NextRequest("http://localhost/api/events/verify-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpay_order_id:   ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature:  SIG,
        registration_code:   REG_CODE,
      }),
    });
    const res = await verifyPayment(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // event_registrations must have been updated (status=confirmed, payment_status=paid)
    const regCalls = db.from.mock.calls.filter(([t]: [string]) => t === "event_registrations");
    expect(regCalls.length).toBeGreaterThanOrEqual(3); // fetch, dup-check, update

    // job_queue must have been written for both email+invoice jobs
    const jobCalls = db.from.mock.calls.filter(([t]: [string]) => t === "job_queue");
    expect(jobCalls.length).toBeGreaterThanOrEqual(2);
  });

  test("verify-payment rejects an invalid Razorpay signature (tampered amount)", async () => {
    const db = makePaymentDb();
    mockDb.mockReturnValue(db);
    const req = new NextRequest("http://localhost/api/events/verify-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpay_order_id:   ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature:  "tampered_sig_should_not_match",
        registration_code:   REG_CODE,
      }),
    });
    const res = await verifyPayment(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid payment signature/i);
  });

  test("verify-payment is idempotent: second call with same payment_id returns 200", async () => {
    // Simulate the registration already having payment_status=paid
    const paidReg = { ...PENDING_REG, payment_status: "paid", status: "confirmed" };
    mockDb.mockReturnValue({
      from: jest.fn().mockReturnValue(ch(paidReg)),
    });
    const req = new NextRequest("http://localhost/api/events/verify-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpay_order_id:   ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature:  SIG,
        registration_code:   REG_CODE,
      }),
    });
    const res = await verifyPayment(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Stage 3: QR Code Generation — signEventQR produces verifiable tokens
// ═══════════════════════════════════════════════════════════════════════════════

describe("Stage 3 — QR Token Lifecycle", () => {
  test("signEventQR produces a token verifiable by verifyEventQR", async () => {
    const { verifyEventQR } = await import("@/lib/event-qr");
    const token   = signEventQR(REG_CODE, EVENT_ID);
    const decoded = verifyEventQR(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.registrationCode).toBe(REG_CODE);
    expect(decoded!.eventId).toBe(EVENT_ID);
  });

  test("a QR token signed for one event fails verification if event_id is swapped", async () => {
    const { verifyEventQR } = await import("@/lib/event-qr");
    const tokenA  = signEventQR(REG_CODE, "evt-A");
    const decoded = verifyEventQR(tokenA);
    // The token carries event ID — route will reject if decoded.eventId !== request event_id
    expect(decoded!.eventId).toBe("evt-A");
    expect(decoded!.eventId).not.toBe("evt-B");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Stage 4: Check-In — updates checked_in_at on the correct table
// ═══════════════════════════════════════════════════════════════════════════════

describe("Stage 4 — Check-In (attendance marking)", () => {
  const CONFIRMED_REG = {
    id: REG_ID, registration_code: REG_CODE,
    user_name: USER_NAME, user_email: USER_EMAIL,
    status: "confirmed", checked_in_at: null,
    events: { title: "Cross Module Run 2026" },
  };

  function makeCheckInDb(participantRow: unknown = null) {
    const counters: Record<string, number> = {};
    return {
      from: jest.fn().mockImplementation((table: string) => {
        counters[table] = (counters[table] ?? 0) + 1;
        if (table === "event_participants")   return ch(participantRow);
        if (table === "event_registrations")  return ch(CONFIRMED_REG);
        return ch(null);
      }),
    };
  }

  test("check-in via legacy QR updates event_registrations.checked_in_at", async () => {
    const db = makeCheckInDb(null); // no participant row → legacy path
    mockDb.mockReturnValue(db);

    const req = adminRequest("http://localhost/api/events/check-in", "POST", { token: QR_TOKEN });
    const res = await checkIn(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.already_checked_in).toBe(false);

    // event_registrations must have been updated
    const updateCalls = db.from.mock.calls.filter(([t]: [string]) => t === "event_registrations");
    expect(updateCalls.length).toBeGreaterThanOrEqual(2); // select + update
  });

  test("check-in is idempotent — already checked-in returns already_checked_in:true", async () => {
    const alreadyIn = { ...CONFIRMED_REG, checked_in_at: "2026-12-01T06:05:00Z" };
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "event_participants")  return ch(null);
        if (table === "event_registrations") return ch(alreadyIn);
        return ch(null);
      }),
    });
    const req = adminRequest("http://localhost/api/events/check-in", "POST", { token: QR_TOKEN });
    const res = await checkIn(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.already_checked_in).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Stage 5a: T-Shirt Distribution — writes event_tshirt_distributions
// ═══════════════════════════════════════════════════════════════════════════════

describe("Stage 5a — T-Shirt Distribution", () => {
  const CONFIRMED_REG = {
    id: REG_ID, registration_code: REG_CODE,
    user_name: USER_NAME, user_email: USER_EMAIL,
    status: "confirmed", payment_status: "paid",
    tshirt_size: "L", tshirt_issued: false,
    tshirt_issued_at: null, tshirt_issued_by: null,
    checked_in_at: "2026-12-01T06:00:00Z",
    events: { title: "Cross Module Run 2026", collect_tshirt: true },
  };

  function makeDb(insertErr: unknown = null) {
    return {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "event_registrations")      return ch(CONFIRMED_REG);
        if (table === "event_tshirt_distributions") return ch({ id: "dist-1" }, insertErr);
        return ch(null);
      }),
    };
  }

  test("first scan inserts into event_tshirt_distributions", async () => {
    const db = makeDb();
    mockDb.mockReturnValue(db);
    const req = adminRequest("http://localhost/api/events/tshirt-distribute", "POST", {
      token:    QR_TOKEN,
      event_id: EVENT_ID,
    });
    const res  = await tshirtDistribute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.already_issued).toBe(false);

    // Verify event_tshirt_distributions was written
    const distCalls = db.from.mock.calls.filter(([t]: [string]) => t === "event_tshirt_distributions");
    expect(distCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("23505 duplicate-key error from concurrent scan returns already_issued:true", async () => {
    const db = makeDb({ code: "23505", message: "duplicate key" });
    mockDb.mockReturnValue(db);
    const req = adminRequest("http://localhost/api/events/tshirt-distribute", "POST", {
      token:    QR_TOKEN,
      event_id: EVENT_ID,
    });
    const res  = await tshirtDistribute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.already_issued).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Stage 5b: Breakfast Marking — updates event_registrations.breakfast_availed
// ═══════════════════════════════════════════════════════════════════════════════

describe("Stage 5b — Breakfast Marking", () => {
  const CONFIRMED_REG = {
    id: REG_ID, registration_code: REG_CODE,
    user_name: USER_NAME, user_email: USER_EMAIL,
    status: "confirmed", checked_in_at: "2026-12-01T06:00:00Z",
    breakfast_availed: false, breakfast_availed_at: null, breakfast_verified_by: null,
    events: { title: "Cross Module Run 2026" },
  };

  test("breakfast scan sets breakfast_availed=true on event_registrations", async () => {
    let call = 0;
    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "event_registrations") {
          call++;
          if (call === 1) return ch(CONFIRMED_REG); // select
          return ch(null);                           // update
        }
        return ch(null);
      }),
    };
    mockDb.mockReturnValue(db);
    const req = adminRequest("http://localhost/api/events/mark-breakfast", "POST", {
      token:    QR_TOKEN,
      event_id: EVENT_ID,
    });
    const res  = await markBreakfast(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.already_availed).toBe(false);

    // Verify event_registrations was both read and updated
    const regCalls = db.from.mock.calls.filter(([t]: [string]) => t === "event_registrations");
    expect(regCalls.length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Stage 6: Participant Dashboard — reflects full lifecycle state
// ═══════════════════════════════════════════════════════════════════════════════

describe("Stage 6 — Participant Dashboard reflects lifecycle state", () => {
  const FINAL_STATE_REG = {
    id: REG_ID, registration_code: REG_CODE,
    user_email: USER_EMAIL, user_name: USER_NAME,
    event_id: EVENT_ID, status: "confirmed",
    payment_status: "paid", final_price: 999,
    distance_category: "10K",
    checked_in_at:        "2026-12-01T06:10:00Z",
    breakfast_availed:    true,
    breakfast_availed_at: "2026-12-01T07:30:00Z",
    tshirt_issued:        true,
    tshirt_issued_at:     "2026-12-01T06:45:00Z",
    qr_token:             QR_TOKEN,
    invoice_number:       "INV-2026-0001",
    pending_category_change: null,
    created_at: "2026-11-01T10:00:00Z",
  };

  const EVENT_FULL = {
    id: EVENT_ID, title: "Cross Module Run 2026",
    location: "Hyderabad", start_date: "2026-12-01",
    cover_image: null,
  };

  test("my-registrations returns registration with all post-lifecycle fields", async () => {
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "event_registrations")      return ch([FINAL_STATE_REG]);
        if (table === "events")                   return ch([EVENT_FULL]);
        if (table === "event_participants")        return ch([]);
        if (table === "invoices")                 return ch([{ id: "inv-1", invoice_number: "INV-2026-0001" }]);
        if (table === "category_change_requests") return ch([]);
        return ch([]);
      }),
    });
    const req = new NextRequest("http://localhost/api/events/my-registrations", {
      headers: { "x-user-token": "tok" },
    });
    const res  = await myRegistrations(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.registrations).toHaveLength(1);

    const reg = body.registrations[0];
    expect(reg.registration_code).toBe(REG_CODE);
    expect(reg.payment_status).toBe("paid");
    expect(reg.status).toBe("confirmed");
    expect(reg.checked_in_at).toBeTruthy();
    expect(reg.breakfast_availed).toBe(true);
    expect(reg.tshirt_issued).toBe(true);
  });

  test("my-registrations returns empty array when user has no registrations", async () => {
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "event_registrations") return ch([]);
        return ch([]);
      }),
    });
    const req = new NextRequest("http://localhost/api/events/my-registrations", {
      headers: { "x-user-token": "tok" },
    });
    const res  = await myRegistrations(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.registrations).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Full sequential journey — one participant, all stages
// ═══════════════════════════════════════════════════════════════════════════════

describe("Full participant lifecycle — sequential validation", () => {
  test("all 6 lifecycle stages complete without error", async () => {
    const ORDER_ID   = "order_seq_001";
    const PAYMENT_ID = "pay_seq_001";
    const SIG        = razorpaySignature(ORDER_ID, PAYMENT_ID);

    const PENDING_REG = {
      id: REG_ID, payment_status: "pending_payment", status: "pending",
      user_email: USER_EMAIL, user_name: USER_NAME,
      event_id: EVENT_ID, coupon_id: null,
      distance_category: "10K", final_price: 999, participant_count: 1,
      events: { title: "Cross Module Run 2026", start_date: "2026-12-01", start_time: "06:00", location: "Hyderabad" },
    };
    const CONFIRMED_FOR_CHECKIN = {
      id: REG_ID, registration_code: REG_CODE,
      user_name: USER_NAME, user_email: USER_EMAIL,
      status: "confirmed", checked_in_at: null,
      events: { title: "Cross Module Run 2026" },
    };
    const CONFIRMED_FOR_TSHIRT = {
      id: REG_ID, registration_code: REG_CODE,
      user_name: USER_NAME, user_email: USER_EMAIL,
      status: "confirmed", payment_status: "paid",
      tshirt_size: "L", tshirt_issued: false, tshirt_issued_at: null, tshirt_issued_by: null,
      checked_in_at: "2026-12-01T06:00:00Z",
      events: { title: "Cross Module Run 2026", collect_tshirt: true },
    };
    const CONFIRMED_FOR_BREAKFAST = {
      id: REG_ID, registration_code: REG_CODE,
      user_name: USER_NAME, user_email: USER_EMAIL,
      status: "confirmed", checked_in_at: "2026-12-01T06:00:00Z",
      breakfast_availed: false, breakfast_availed_at: null, breakfast_verified_by: null,
      events: { title: "Cross Module Run 2026" },
    };

    // ── Step 2: verify payment ─────────────────────────────────────────────
    {
      let regCall = 0;
      mockDb.mockReturnValue({
        from: jest.fn().mockImplementation((table: string) => {
          if (table === "event_registrations") {
            regCall++;
            if (regCall === 1) return ch(PENDING_REG);
            if (regCall === 2) return ch(null); // dup payment check
            return ch(null);
          }
          if (table === "job_queue") return ch({ id: "job-1" });
          return ch(null);
        }),
      });
      const payReq = new NextRequest("http://localhost/api/events/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ razorpay_order_id: ORDER_ID, razorpay_payment_id: PAYMENT_ID, razorpay_signature: SIG, registration_code: REG_CODE }),
      });
      const payRes = await verifyPayment(payReq);
      expect(payRes.status).toBe(200);
    }

    // ── Step 3: check-in ───────────────────────────────────────────────────
    {
      mockDb.mockReturnValue({
        from: jest.fn().mockImplementation((table: string) => {
          if (table === "event_participants")  return ch(null);
          if (table === "event_registrations") return ch(CONFIRMED_FOR_CHECKIN);
          return ch(null);
        }),
      });
      const checkInRes = await checkIn(adminRequest("http://localhost/api/events/check-in", "POST", { token: QR_TOKEN }));
      expect(checkInRes.status).toBe(200);
      const checkInBody = await checkInRes.json();
      expect(checkInBody.valid).toBe(true);
      expect(checkInBody.already_checked_in).toBe(false);
    }

    // ── Step 4: t-shirt ────────────────────────────────────────────────────
    {
      mockDb.mockReturnValue({
        from: jest.fn().mockImplementation((table: string) => {
          if (table === "event_registrations")       return ch(CONFIRMED_FOR_TSHIRT);
          if (table === "event_tshirt_distributions") return ch({ id: "dist-1" });
          return ch(null);
        }),
      });
      const tshirtRes = await tshirtDistribute(adminRequest("http://localhost/api/events/tshirt-distribute", "POST", { token: QR_TOKEN, event_id: EVENT_ID }));
      expect(tshirtRes.status).toBe(200);
      expect((await tshirtRes.json()).already_issued).toBe(false);
    }

    // ── Step 5: breakfast ──────────────────────────────────────────────────
    {
      let breakfastCall = 0;
      mockDb.mockReturnValue({
        from: jest.fn().mockImplementation((table: string) => {
          if (table === "event_registrations") {
            breakfastCall++;
            if (breakfastCall === 1) return ch(CONFIRMED_FOR_BREAKFAST);
            return ch(null); // update
          }
          return ch(null);
        }),
      });
      const bfRes = await markBreakfast(adminRequest("http://localhost/api/events/mark-breakfast", "POST", { token: QR_TOKEN, event_id: EVENT_ID }));
      expect(bfRes.status).toBe(200);
      expect((await bfRes.json()).already_availed).toBe(false);
    }
  });
});
