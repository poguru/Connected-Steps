process.env.COACH_TOKEN_SECRET        = "test-coach-secret";
process.env.ADMIN_PASSWORD            = "test-admin-password";
process.env.USER_TOKEN_SECRET         = "test-user-secret";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/notify", () => ({
  sendEmail:                  jest.fn().mockResolvedValue({ ok: true, messageId: "msg-1" }),
  eventRegistrationEmailHTML: jest.fn().mockReturnValue("<html>confirmation</html>"),
}));
jest.mock("@/lib/coupon-redeem", () => ({ redeemCoupon: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/admin-auth", () => {
  const actual = jest.requireActual<typeof import("@/lib/admin-auth")>("@/lib/admin-auth");
  return { ...actual, verifyUserToken: jest.fn() };
});

import { POST }              from "@/app/api/events/register/route";
import { NextRequest }       from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken }   from "@/lib/admin-auth";

const mockDb     = getSupabaseServer as jest.Mock;
const mockVerify = verifyUserToken    as jest.Mock;

const EMAIL = "runner@test.com";
const TOKEN = "test-user-token";

// ── Chainable Supabase mock ────────────────────────────────────────────────────
// Every method returns `self` so arbitrary chains resolve correctly.
// Awaiting the chain directly returns { data, error, count }.
// .single() / .maybeSingle() resolve to the configured data.
// Write methods (insert/upsert/update/delete) return a new chain so
// follow-on .select().single() chains work correctly.

function ch(data: unknown, error: unknown = null): Record<string, jest.Mock> {
  const result = { data, error, count: null as number | null };
  const self: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;

  for (const m of [
    "select", "eq", "neq", "order", "limit", "is", "in",
    "not", "filter", "gte", "lte", "ilike", "or",
  ]) {
    self[m] = jest.fn().mockReturnValue(self);
  }

  self.single      = jest.fn().mockResolvedValue({
    data: Array.isArray(data) ? (data[0] ?? null) : data, error,
  });
  self.maybeSingle = jest.fn().mockResolvedValue({
    data: Array.isArray(data) ? (data[0] ?? null) : data, error,
  });

  self.insert = jest.fn().mockImplementation(() => ch(data, error));
  self.upsert = jest.fn().mockImplementation(() => ch(data, error));
  self.update = jest.fn().mockImplementation(() => ch(null));
  self.delete = jest.fn().mockImplementation(() => ch(null));

  // Make the chain awaitable directly (for queries without .single())
  self.then = jest.fn().mockImplementation(
    (res: (v: unknown) => unknown, rej?: (v: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  );

  return self;
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const USER_ROW = { email: EMAIL, first_name: "Test", last_name: "Runner" };
const REG_ROW  = { id: "reg-1", registration_code: "CS-EVT-TEST1", qr_token: "qr-token" };

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const PAST   = new Date(Date.now() - 86400_000).toISOString();

const EVENT_FREE: Record<string, unknown> = {
  id: "evt-1", title: "City 5K 2026", price: 0,
  max_participants: 100, participant_count: 10,
  start_date: "2099-12-01", start_time: "06:00",
  end_date: "2099-12-01", end_time: "23:59",
  registration_closes_at: null, location: "Kondapur",
  status: "published", distance_categories: ["5K", "10K"],
  collect_tshirt: false, early_bird_ends_at: null,
};
const EVENT_PAID  = { ...EVENT_FREE, price: 999 };
const EVENT_FULL  = { ...EVENT_FREE, max_participants: 10, participant_count: 10 };
const EVENT_MULTI = {
  ...EVENT_FREE, price: 500,
  allow_multi_participant: true, max_per_registration: 10,
};
const EVENT_MULTI_PAID = { ...EVENT_MULTI, price: 500 };

const COUPON = {
  id: "cpn-1", code: "SAVE50", discount_type: "percentage", discount_value: 50,
  expires_at: FUTURE, use_count: 0, max_uses: 100,
  event_id: null, assigned_to_email: null,
};
const COUPON_FIXED = {
  ...COUPON, discount_type: "fixed", discount_value: 200,
};

// ── DB factory ─────────────────────────────────────────────────────────────────

interface DbCfg {
  user?:        unknown;
  event?:       unknown;
  races?:       unknown[];
  existingReg?: unknown;
  waitlist?:    unknown;
  formFields?:  unknown[];
  coupon?:      unknown;
  couponUses?:  unknown[];
  upsertErr?:   boolean;
}

function makeDb(cfg: DbCfg = {}): ReturnType<typeof getSupabaseServer> {
  const {
    user        = USER_ROW,
    event       = EVENT_FREE,
    races       = [],
    existingReg = null,
    waitlist    = null,
    formFields  = [],
    coupon      = null,
    couponUses  = [],
    upsertErr   = false,
  } = cfg;

  const counters: Record<string, number> = {};

  return {
    rpc:  jest.fn().mockResolvedValue({ data: 1, error: null }),
    from: jest.fn().mockImplementation((table: string) => {
      counters[table] = (counters[table] ?? 0) + 1;
      const n = counters[table];

      switch (table) {
        case "users":             return ch(user);
        case "events":            return ch(event);
        case "event_races":       return ch(races);
        case "event_waitlist":    return ch(waitlist);
        case "event_form_fields": return ch(formFields);
        case "coupon_uses":       return ch(couponUses);
        case "coupons":
          return coupon
            ? ch(coupon)
            : ch(null, { code: "PGRST116", message: "Not found" });
        case "event_participants":
          return ch(null);
        case "event_registrations":
          if (n === 1) return ch(existingReg);       // duplicate check (.maybeSingle)
          if (n === 2) {                              // upsert (free: chained .select().single(); paid: direct await)
            return upsertErr
              ? ch(null, { message: "db error" })
              : ch(REG_ROW);
          }
          return ch({ id: "reg-1" });                // paid: fetch pendingReg.id; after() update calls
        default:
          return ch(null);
      }
    }),
  } as unknown as ReturnType<typeof getSupabaseServer>;
}

// ── Request helpers ────────────────────────────────────────────────────────────

function makeReq(body: unknown, extraHeaders: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/events/register", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "x-user-token": TOKEN, ...extraHeaders },
    body:    JSON.stringify(body),
  });
}

const VALID_SINGLE = {
  event_id:          "evt-1",
  email:             EMAIL,
  name:              "Test Runner",
  phone:             "9876543210",
  gender:            "male",
  date_of_birth:     "1990-01-15",
  blood_group:       "O+",
  emergency_contact: "9876543211",
  special_notes:     "NA",
  distance_category: "5K",
};

const P1 = { first_name: "Alice", last_name: "Smith", gender: "female", date_of_birth: "1992-05-20", blood_group: "A+", mobile: "9876543210", distance_category: "5K" };
const P2 = { first_name: "Bob",   last_name: "Jones", gender: "male",   date_of_birth: "1988-03-15", blood_group: "B+", mobile: "9876543211", distance_category: "10K" };

const VALID_MULTI = {
  event_id:          "evt-1",
  email:             EMAIL,
  emergency_contact: "9876540000",
  special_notes:     "NA",
  participants:      [P1, P2],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockReturnValue(EMAIL);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Auth & input validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/events/register — auth", () => {
  test("returns 401 when x-user-token header is missing", async () => {
    const req = new NextRequest("http://localhost/api/events/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_SINGLE),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  test("returns 401 when token is invalid", async () => {
    mockVerify.mockReturnValue(null);
    mockDb.mockReturnValue(makeDb());
    const res = await POST(makeReq(VALID_SINGLE));
    expect(res.status).toBe(401);
  });

  test("returns 403 when token email does not match request email", async () => {
    mockVerify.mockReturnValue("other@test.com");
    mockDb.mockReturnValue(makeDb());
    const res  = await POST(makeReq(VALID_SINGLE));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/events/register — field validation", () => {
  test("returns 400 when event_id is missing", async () => {
    mockDb.mockReturnValue(makeDb());
    const { event_id: _, ...noEventId } = VALID_SINGLE;
    const res = await POST(makeReq(noEventId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/event_id/i);
  });

  test("returns 400 when phone has wrong format", async () => {
    mockDb.mockReturnValue(makeDb());
    const res  = await POST(makeReq({ ...VALID_SINGLE, phone: "12345" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/phone/i);
  });

  test("returns 400 when date_of_birth is in the future", async () => {
    mockDb.mockReturnValue(makeDb());
    const res  = await POST(makeReq({ ...VALID_SINGLE, date_of_birth: "2099-01-01" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/date of birth/i);
  });

  test("returns 400 when special_notes is empty", async () => {
    mockDb.mockReturnValue(makeDb());
    const res  = await POST(makeReq({ ...VALID_SINGLE, special_notes: "   " }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/special notes/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Event checks
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/events/register — event checks", () => {
  test("returns 404 when user account does not exist", async () => {
    mockDb.mockReturnValue(makeDb({ user: null }));
    const res  = await POST(makeReq(VALID_SINGLE));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/account not found/i);
  });

  test("returns 404 when event does not exist or is not published", async () => {
    mockDb.mockReturnValue(makeDb({ event: null }));
    const res  = await POST(makeReq(VALID_SINGLE));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/event not found/i);
  });

  test("returns 404 for a draft event", async () => {
    mockDb.mockReturnValue(makeDb({ event: { ...EVENT_FREE, status: "draft" } }));
    const res  = await POST(makeReq(VALID_SINGLE));
    expect(res.status).toBe(404);
  });

  test("returns 403 when registration window has closed", async () => {
    mockDb.mockReturnValue(makeDb({ event: { ...EVENT_FREE, registration_closes_at: PAST } }));
    const res  = await POST(makeReq(VALID_SINGLE));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/closed/i);
  });

  test("returns 403 when event has already ended (past end_date)", async () => {
    mockDb.mockReturnValue(makeDb({ event: { ...EVENT_FREE, end_date: "2020-01-01" } }));
    const res  = await POST(makeReq(VALID_SINGLE));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/already ended/i);
  });

  test("returns 400 when an invalid distance category is selected", async () => {
    mockDb.mockReturnValue(makeDb({ event: EVENT_FREE }));
    const res  = await POST(makeReq({ ...VALID_SINGLE, distance_category: "42K" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid distance category/i);
  });

  test("returns 400 when t-shirt size is missing and collect_tshirt is true", async () => {
    mockDb.mockReturnValue(makeDb({ event: { ...EVENT_FREE, collect_tshirt: true } }));
    const res  = await POST(makeReq({ ...VALID_SINGLE, tshirt_size: undefined }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/t-shirt size/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Capacity & duplicate
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/events/register — capacity and duplicates", () => {
  test("returns 409 when event is fully booked and user has no approved waitlist entry", async () => {
    mockDb.mockReturnValue(makeDb({ event: EVENT_FULL, waitlist: null }));
    const res  = await POST(makeReq(VALID_SINGLE));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/fully booked/i);
  });

  test("allows registration when event is full but user has approved waitlist entry", async () => {
    mockDb.mockReturnValue(makeDb({
      event:   EVENT_FULL,
      waitlist: { id: "wl-1" },
    }));
    const res  = await POST(makeReq(VALID_SINGLE));
    // Should not be 409 — route proceeds to free/paid path
    expect(res.status).not.toBe(409);
  });

  test("returns already:true when user is already registered (paid)", async () => {
    mockDb.mockReturnValue(makeDb({
      existingReg: { id: "reg-old", registration_code: "CS-EVT-OLD01", payment_status: "paid" },
    }));
    const res  = await POST(makeReq(VALID_SINGLE));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.already).toBe(true);
    expect(body.registration_code).toBe("CS-EVT-OLD01");
  });

  test("returns already:true when user is already registered (free)", async () => {
    mockDb.mockReturnValue(makeDb({
      existingReg: { id: "reg-old", registration_code: "CS-EVT-OLD02", payment_status: "free" },
    }));
    const res  = await POST(makeReq(VALID_SINGLE));
    const body = await res.json();
    expect(body.already).toBe(true);
  });

  test("does not block a pending_payment registration from re-attempting", async () => {
    // pending_payment is not "free" or "paid" — user should be able to retry
    mockDb.mockReturnValue(makeDb({
      event:       EVENT_PAID,
      existingReg: { id: "reg-old", registration_code: "CS-EVT-OLD03", payment_status: "pending" },
    }));
    const res  = await POST(makeReq(VALID_SINGLE));
    // Route proceeds — returns requires_payment, not already:true
    const body = await res.json();
    expect(body.already).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Free registration path
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/events/register — free event", () => {
  test("returns success with free:true for a free event", async () => {
    mockDb.mockReturnValue(makeDb({ event: EVENT_FREE }));
    const res  = await POST(makeReq(VALID_SINGLE));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.free).toBe(true);
    expect(body.registration_code).toMatch(/^CS-EVT-/);
  });

  test("returns 500 when database upsert fails on free path", async () => {
    mockDb.mockReturnValue(makeDb({ event: EVENT_FREE, upsertErr: true }));
    const res  = await POST(makeReq(VALID_SINGLE));
    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Paid registration path
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/events/register — paid event", () => {
  test("returns requires_payment:true for a paid event", async () => {
    mockDb.mockReturnValue(makeDb({ event: EVENT_PAID }));
    const res  = await POST(makeReq(VALID_SINGLE));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.free).toBe(false);
    expect(body.requires_payment).toBe(true);
    expect(body.final_price).toBe(999);
    expect(body.registration_code).toBeDefined();
  });

  test("returns 500 when database upsert fails on paid path", async () => {
    mockDb.mockReturnValue(makeDb({ event: EVENT_PAID, upsertErr: true }));
    const res  = await POST(makeReq(VALID_SINGLE));
    expect(res.status).toBe(500);
  });

  test("applies early bird price when early_bird_ends_at is in the future", async () => {
    const races = [{ id: "race-1", distance: "5K", price: 999, early_bird_price: 499 }];
    mockDb.mockReturnValue(makeDb({
      event: { ...EVENT_PAID, early_bird_ends_at: FUTURE },
      races,
    }));
    const res  = await POST(makeReq(VALID_SINGLE));
    const body = await res.json();
    expect(body.original_price).toBe(499);
    expect(body.final_price).toBe(499);
  });

  test("uses regular race price when early bird window has ended", async () => {
    const races = [{ id: "race-1", distance: "5K", price: 999, early_bird_price: 499 }];
    mockDb.mockReturnValue(makeDb({
      event: { ...EVENT_PAID, early_bird_ends_at: PAST },
      races,
    }));
    const res  = await POST(makeReq(VALID_SINGLE));
    const body = await res.json();
    expect(body.original_price).toBe(999);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Coupon validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/events/register — coupons", () => {
  test("applies percentage coupon discount to final_price", async () => {
    mockDb.mockReturnValue(makeDb({ event: EVENT_PAID, coupon: COUPON }));
    const res  = await POST(makeReq({ ...VALID_SINGLE, coupon_code: "SAVE50" }));
    const body = await res.json();
    expect(body.coupon_discount).toBe(500);   // 50% of 999 → rounded 500 (Math.round(999*50/100)=500)
    expect(body.final_price).toBe(499);
  });

  test("applies fixed coupon discount to final_price", async () => {
    mockDb.mockReturnValue(makeDb({ event: EVENT_PAID, coupon: COUPON_FIXED }));
    const res  = await POST(makeReq({ ...VALID_SINGLE, coupon_code: "SAVE50" }));
    const body = await res.json();
    expect(body.coupon_discount).toBe(200);
    expect(body.final_price).toBe(799);
  });

  test("returns 400 for an invalid coupon code", async () => {
    mockDb.mockReturnValue(makeDb({ event: EVENT_PAID, coupon: null }));
    const res  = await POST(makeReq({ ...VALID_SINGLE, coupon_code: "BADCODE" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid coupon/i);
  });

  test("returns 400 when coupon has expired", async () => {
    mockDb.mockReturnValue(makeDb({
      event:  EVENT_PAID,
      coupon: { ...COUPON, expires_at: PAST },
    }));
    const res  = await POST(makeReq({ ...VALID_SINGLE, coupon_code: "SAVE50" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/expired/i);
  });

  test("returns 400 when coupon has reached its usage limit", async () => {
    mockDb.mockReturnValue(makeDb({
      event:  EVENT_PAID,
      coupon: { ...COUPON, use_count: 100, max_uses: 100 },
    }));
    const res  = await POST(makeReq({ ...VALID_SINGLE, coupon_code: "SAVE50" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/usage limit/i);
  });

  test("returns 400 when coupon is restricted to a different event", async () => {
    mockDb.mockReturnValue(makeDb({
      event:  EVENT_PAID,
      coupon: { ...COUPON, event_id: "other-evt" },
    }));
    const res  = await POST(makeReq({ ...VALID_SINGLE, coupon_code: "SAVE50" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not valid for this event/i);
  });

  test("returns 400 when coupon is assigned to a different email", async () => {
    mockDb.mockReturnValue(makeDb({
      event:  EVENT_PAID,
      coupon: { ...COUPON, assigned_to_email: "other@test.com" },
    }));
    const res  = await POST(makeReq({ ...VALID_SINGLE, coupon_code: "SAVE50" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not assigned to your account/i);
  });

  test("returns 400 when user has already used this coupon", async () => {
    mockDb.mockReturnValue(makeDb({
      event:      EVENT_PAID,
      coupon:     COUPON,
      couponUses: [{ id: "use-1" }],
    }));
    const res  = await POST(makeReq({ ...VALID_SINGLE, coupon_code: "SAVE50" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already used/i);
  });

  test("100% coupon turns a paid event into a free registration", async () => {
    mockDb.mockReturnValue(makeDb({
      event:  EVENT_PAID,
      coupon: { ...COUPON, discount_type: "percentage", discount_value: 100 },
    }));
    const res  = await POST(makeReq({ ...VALID_SINGLE, coupon_code: "FULL" }));
    const body = await res.json();
    expect(body.free).toBe(true);
    expect(body.requires_payment).toBeUndefined();
  });

  test("coupon is not applied when event price is 0", async () => {
    // Free event: coupon code is accepted but has no effect
    mockDb.mockReturnValue(makeDb({ event: EVENT_FREE, coupon: COUPON }));
    const res  = await POST(makeReq({ ...VALID_SINGLE, coupon_code: "SAVE50" }));
    const body = await res.json();
    expect(body.free).toBe(true);
    // No error — coupon guard only triggers when ev.price > 0
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Custom form fields
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/events/register — custom form fields", () => {
  const FIELD = { field_key: "emergency_name", label: "Emergency Contact Name", required: true };

  test("returns 400 when a required custom field is missing", async () => {
    mockDb.mockReturnValue(makeDb({ event: EVENT_FREE, formFields: [FIELD] }));
    const res  = await POST(makeReq({ ...VALID_SINGLE, custom_fields: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/"Emergency Contact Name" is required/);
  });

  test("proceeds when required custom field is provided", async () => {
    mockDb.mockReturnValue(makeDb({ event: EVENT_FREE, formFields: [FIELD] }));
    const res  = await POST(makeReq({
      ...VALID_SINGLE,
      custom_fields: { emergency_name: "John Doe" },
    }));
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Multi-participant path
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/events/register — multi-participant", () => {
  test("returns 400 when event does not allow multi-participant registration", async () => {
    mockDb.mockReturnValue(makeDb({ event: { ...EVENT_FREE, allow_multi_participant: false } }));
    const res  = await POST(makeReq(VALID_MULTI));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/does not support multi-participant/i);
  });

  test("returns 400 when participants array exceeds 10", async () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => ({ ...P1, first_name: `Person${i}` }));
    mockDb.mockReturnValue(makeDb({ event: EVENT_MULTI }));
    const res  = await POST(makeReq({ ...VALID_MULTI, participants: tooMany }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/1 and 10 participants/i);
  });

  test("returns 400 when a participant is missing first_name", async () => {
    const badParticipant = { ...P1, first_name: "" };
    mockDb.mockReturnValue(makeDb({ event: EVENT_MULTI }));
    const res  = await POST(makeReq({ ...VALID_MULTI, participants: [badParticipant] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/first name/i);
  });

  test("returns 400 when a participant has an invalid phone", async () => {
    const badPhone = { ...P1, mobile: "12345" };
    mockDb.mockReturnValue(makeDb({ event: EVENT_MULTI }));
    const res  = await POST(makeReq({ ...VALID_MULTI, participants: [badPhone] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/phone/i);
  });

  test("returns 400 when a participant selects an invalid distance category", async () => {
    const badCat = { ...P1, distance_category: "100K" };
    mockDb.mockReturnValue(makeDb({ event: EVENT_MULTI }));
    const res  = await POST(makeReq({ ...VALID_MULTI, participants: [badCat] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid distance category/i);
  });

  test("free multi-participant booking returns success with participant_count", async () => {
    mockDb.mockReturnValue(makeDb({ event: { ...EVENT_MULTI, price: 0 } }));
    const res  = await POST(makeReq(VALID_MULTI));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.free).toBe(true);
    expect(body.participant_count).toBe(2);
  });

  test("paid multi-participant booking returns requires_payment with total price", async () => {
    mockDb.mockReturnValue(makeDb({ event: EVENT_MULTI_PAID }));
    const res  = await POST(makeReq(VALID_MULTI));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requires_payment).toBe(true);
    expect(body.original_price).toBe(1000);  // 2 × 500
    expect(body.participant_count).toBe(2);
  });

  test("coupon applied once to total booking, not per participant", async () => {
    mockDb.mockReturnValue(makeDb({ event: EVENT_MULTI_PAID, coupon: COUPON_FIXED }));
    const res  = await POST(makeReq({ ...VALID_MULTI, coupon_code: "SAVE50" }));
    const body = await res.json();
    // Total = 2 × 500 = 1000; fixed discount = 200 → final = 800
    expect(body.original_price).toBe(1000);
    expect(body.coupon_discount).toBe(200);
    expect(body.final_price).toBe(800);
  });

  test("409 when group size would exceed remaining capacity", async () => {
    // 5 spots left, group of 3 → total needed = 10+3 > max 12
    const nearlyFull = { ...EVENT_MULTI_PAID, max_participants: 12, participant_count: 10 };
    mockDb.mockReturnValue(makeDb({ event: nearlyFull, waitlist: null }));
    const res  = await POST(makeReq({ ...VALID_MULTI, participants: [P1, P2, { ...P1, first_name: "Charlie" }] }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/not enough spots/i);
  });
});
