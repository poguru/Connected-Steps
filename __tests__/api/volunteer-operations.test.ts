/**
 * Volunteer operations test suite — Phase 1 volunteer journey.
 *
 * Covers:
 *  • POST /api/events/tshirt-distribute  — issue T-shirt
 *  • POST /api/events/mark-breakfast     — mark breakfast as availed
 *
 * Both routes share the same auth model (isAdminOrCoach) and QR verification
 * pattern, and are idempotent by design.
 */

process.env.COACH_TOKEN_SECRET        = "test-coach-secret";
process.env.ADMIN_PASSWORD            = "test-admin-password";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth", () => {
  const actual = jest.requireActual<typeof import("@/lib/admin-auth")>("@/lib/admin-auth");
  return { ...actual, isAdminOrCoach: jest.fn() };
});

import { POST as tshirtDistribute } from "@/app/api/events/tshirt-distribute/route";
import { POST as markBreakfast }    from "@/app/api/events/mark-breakfast/route";
import { NextRequest }              from "next/server";
import { getSupabaseServer }        from "@/lib/supabase-server";
import { isAdminOrCoach }           from "@/lib/admin-auth";
import { signEventQR }              from "@/lib/event-qr";

const mockDb   = getSupabaseServer as jest.Mock;
const mockAuth = isAdminOrCoach    as jest.Mock;

const EVENT_ID = "evt-vol-1";
const REG_CODE = "CS-EVT-VOL001";
const VALID_TOKEN = signEventQR(REG_CODE, EVENT_ID);

// ── Chainable mock ─────────────────────────────────────────────────────────────

function ch(data: unknown, error: unknown = null): Record<string, jest.Mock> {
  const result = { data, error };
  const self: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  for (const m of ["select", "eq", "neq", "order", "limit", "not"]) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  self.single      = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  self.maybeSingle = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  self.insert      = jest.fn().mockImplementation(() => ch(data, error));
  self.update      = jest.fn().mockImplementation(() => ch(data, error));
  self.delete      = jest.fn().mockImplementation(() => ch(null));
  self.then        = jest.fn().mockImplementation(
    (res: (v: unknown) => unknown, rej?: (v: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  );
  return self;
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const CONFIRMED_REG = {
  id: "reg-1",
  registration_code: REG_CODE,
  user_name:         "Volunteer Test",
  user_email:        "volunteer@test.com",
  status:            "confirmed",
  payment_status:    "paid",
  tshirt_size:       "L",
  tshirt_issued:     false,
  tshirt_issued_at:  null,
  tshirt_issued_by:  null,
  breakfast_availed:     false,
  breakfast_availed_at:  null,
  breakfast_verified_by: null,
  checked_in_at:    "2026-12-01T06:15:00Z",
  events: { title: "City Run 2026", start_date: "2026-12-01", location: "Kondapur", collect_tshirt: true },
};

function makeReq(route: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${route}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(true);
});

// ═══════════════════════════════════════════════════════════════════════════════
// T-Shirt Distribution
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/events/tshirt-distribute — auth & input", () => {
  test("returns 401 when caller is not admin or coach", async () => {
    mockAuth.mockResolvedValue(false);
    const res = await tshirtDistribute(makeReq("/api/events/tshirt-distribute", { token: VALID_TOKEN }));
    expect(res.status).toBe(401);
  });

  test("returns 400 when token is missing from request body", async () => {
    const res = await tshirtDistribute(makeReq("/api/events/tshirt-distribute", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/token is required/i);
  });

  test("returns 400 for a tampered or invalid QR token", async () => {
    const res = await tshirtDistribute(makeReq("/api/events/tshirt-distribute", { token: "tampered.bad.token" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid qr/i);
  });

  test("returns 400 when request body is not valid JSON", async () => {
    const req = new NextRequest("http://localhost/api/events/tshirt-distribute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await tshirtDistribute(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/events/tshirt-distribute — registration checks", () => {
  test("returns 404 when registration is not found", async () => {
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch(null, { code: "PGRST116" })) });
    const res  = await tshirtDistribute(makeReq("/api/events/tshirt-distribute", { token: VALID_TOKEN }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  test("returns 409 for a cancelled registration", async () => {
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch({ ...CONFIRMED_REG, status: "cancelled" })) });
    const res  = await tshirtDistribute(makeReq("/api/events/tshirt-distribute", { token: VALID_TOKEN }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/cancelled/i);
  });

  test("returns 409 when registration is not confirmed (pending_payment)", async () => {
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch({ ...CONFIRMED_REG, status: "pending_payment" })) });
    const res  = await tshirtDistribute(makeReq("/api/events/tshirt-distribute", { token: VALID_TOKEN }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/not confirmed/i);
  });

  test("returns 409 when no t-shirt size is recorded for the participant", async () => {
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch({ ...CONFIRMED_REG, tshirt_size: null })) });
    const res  = await tshirtDistribute(makeReq("/api/events/tshirt-distribute", { token: VALID_TOKEN }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/no t-shirt size/i);
  });
});

describe("POST /api/events/tshirt-distribute — happy path", () => {
  test("issues t-shirt successfully on first scan", async () => {
    let call = 0;
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation(() => {
        call++;
        if (call === 1) return ch(CONFIRMED_REG);   // registration lookup
        return ch(null);                             // audit insert + reg update
      }),
    });
    const res  = await tshirtDistribute(makeReq("/api/events/tshirt-distribute", { token: VALID_TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.already_issued).toBe(false);
    expect(body.registration.tshirt_size).toBe("L");
    expect(body.registration.name).toBe("Volunteer Test");
  });

  test("returns already_issued:true on duplicate scan (idempotent)", async () => {
    mockDb.mockReturnValue({
      from: jest.fn().mockReturnValue(ch({ ...CONFIRMED_REG, tshirt_issued: true, tshirt_issued_at: "2026-12-01T07:00:00Z" })),
    });
    const res  = await tshirtDistribute(makeReq("/api/events/tshirt-distribute", { token: VALID_TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.already_issued).toBe(true);
    expect(body.message).toMatch(/already issued/i);
  });

  test("returns preview info without issuing when dry_run=true", async () => {
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch(CONFIRMED_REG)) });
    const res  = await tshirtDistribute(makeReq("/api/events/tshirt-distribute", { token: VALID_TOKEN, dry_run: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preview).toBe(true);
    expect(body.valid).toBe(true);
    // No actual DB write should happen for dry_run — the route returns early
  });

  test("handles concurrent double-issue via UNIQUE constraint (23505 = already_issued)", async () => {
    let call = 0;
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation(() => {
        call++;
        if (call === 1) return ch(CONFIRMED_REG); // lookup
        return ch(null, { code: "23505", message: "unique violation" }); // audit insert conflict
      }),
    });
    const res  = await tshirtDistribute(makeReq("/api/events/tshirt-distribute", { token: VALID_TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.already_issued).toBe(true);
  });

  test("returns 500 on unexpected database error during audit insert", async () => {
    let call = 0;
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation(() => {
        call++;
        if (call === 1) return ch(CONFIRMED_REG);
        return ch(null, { code: "500", message: "connection error" });
      }),
    });
    const res  = await tshirtDistribute(makeReq("/api/events/tshirt-distribute", { token: VALID_TOKEN }));
    expect(res.status).toBe(500);
  });

  test("response includes event title from registration join", async () => {
    let call = 0;
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation(() => { call++; return call === 1 ? ch(CONFIRMED_REG) : ch(null); }),
    });
    const res  = await tshirtDistribute(makeReq("/api/events/tshirt-distribute", { token: VALID_TOKEN }));
    const body = await res.json();
    expect(body.registration.event).toBe("City Run 2026");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Breakfast Distribution
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/events/mark-breakfast — auth & input", () => {
  test("returns 401 when caller is not admin or coach", async () => {
    mockAuth.mockResolvedValue(false);
    const res = await markBreakfast(makeReq("/api/events/mark-breakfast", { token: VALID_TOKEN, event_id: EVENT_ID }));
    expect(res.status).toBe(401);
  });

  test("returns 400 when QR token is missing", async () => {
    const res = await markBreakfast(makeReq("/api/events/mark-breakfast", { event_id: EVENT_ID }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/qr token is required/i);
  });

  test("returns 400 when event_id is missing", async () => {
    const res = await markBreakfast(makeReq("/api/events/mark-breakfast", { token: VALID_TOKEN }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/event_id is required/i);
  });

  test("returns 400 for invalid QR token signature", async () => {
    const res = await markBreakfast(makeReq("/api/events/mark-breakfast", { token: "bad.token", event_id: EVENT_ID }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid qr/i);
  });

  test("returns 400 when QR token belongs to a different event", async () => {
    const wrongEventToken = signEventQR(REG_CODE, "evt-different");
    const res = await markBreakfast(makeReq("/api/events/mark-breakfast", { token: wrongEventToken, event_id: EVENT_ID }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/different event/i);
    expect(body.code).toBe("WRONG_EVENT");
  });
});

describe("POST /api/events/mark-breakfast — registration checks", () => {
  test("returns 404 when registration is not found", async () => {
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch(null)) });
    const res  = await markBreakfast(makeReq("/api/events/mark-breakfast", { token: VALID_TOKEN, event_id: EVENT_ID }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  test("returns 409 for a cancelled registration", async () => {
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch({ ...CONFIRMED_REG, status: "cancelled" })) });
    const res  = await markBreakfast(makeReq("/api/events/mark-breakfast", { token: VALID_TOKEN, event_id: EVENT_ID }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/cancelled/i);
  });

  test("returns 409 for an unconfirmed registration", async () => {
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch({ ...CONFIRMED_REG, status: "pending_payment" })) });
    const res  = await markBreakfast(makeReq("/api/events/mark-breakfast", { token: VALID_TOKEN, event_id: EVENT_ID }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/not confirmed/i);
  });
});

describe("POST /api/events/mark-breakfast — happy path", () => {
  test("marks breakfast as availed on first scan", async () => {
    let call = 0;
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation(() => {
        call++;
        if (call === 1) return ch(CONFIRMED_REG);
        return ch(null); // update
      }),
    });
    const res  = await markBreakfast(makeReq("/api/events/mark-breakfast", { token: VALID_TOKEN, event_id: EVENT_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.already_availed).toBe(false);
    expect(body.registration.name).toBe("Volunteer Test");
  });

  test("returns already_availed:true on duplicate scan (idempotent)", async () => {
    const alreadyAvailed = {
      ...CONFIRMED_REG,
      breakfast_availed:     true,
      breakfast_availed_at:  "2026-12-01T07:30:00Z",
      breakfast_verified_by: "volunteer@cs.run",
    };
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch(alreadyAvailed)) });
    const res  = await markBreakfast(makeReq("/api/events/mark-breakfast", { token: VALID_TOKEN, event_id: EVENT_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.already_availed).toBe(true);
    expect(body.message).toMatch(/already availed/i);
    expect(body.registration.breakfast_availed_at).toBe("2026-12-01T07:30:00Z");
  });

  test("returns 500 on database update failure", async () => {
    let call = 0;
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation(() => {
        call++;
        if (call === 1) return ch(CONFIRMED_REG);
        return ch(null, { message: "db error" }); // update fails
      }),
    });
    const res  = await markBreakfast(makeReq("/api/events/mark-breakfast", { token: VALID_TOKEN, event_id: EVENT_ID }));
    expect(res.status).toBe(500);
  });

  test("response includes event title and breakfast timing", async () => {
    let call = 0;
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation(() => { call++; return call === 1 ? ch(CONFIRMED_REG) : ch(null); }),
    });
    const res  = await markBreakfast(makeReq("/api/events/mark-breakfast", { token: VALID_TOKEN, event_id: EVENT_ID }));
    const body = await res.json();
    expect(body.registration.event).toBe("City Run 2026");
    expect(body.registration.breakfast_availed_at).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Volunteer journey — full sequential flow
// ═══════════════════════════════════════════════════════════════════════════════

describe("Volunteer journey — complete workflow for a participant", () => {
  test("QR scan → check-in → t-shirt issue → breakfast mark all succeed in sequence", async () => {
    const { POST: checkIn } = require("@/app/api/events/check-in/route");

    const PARTICIPANT = {
      id:              "part-seq-1",
      registration_id: "reg-seq-1",
      first_name:      "Sequential",
      last_name:       "Tester",
      distance_category: "10K",
      tshirt_size:     "M",
      bib_number:      "042",
      checked_in_at:   null,
      checked_in_by:   null,
      status:          "active",
      event_id:        EVENT_ID,
      events:          { title: "City Run 2026" },
      event_registrations: { registration_code: REG_CODE },
    };

    const FULL_REG = {
      ...CONFIRMED_REG,
      id:               "reg-seq-1",
      registration_code: REG_CODE,
    };

    let checkInCall = 0;
    // Step 1: Check in
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        checkInCall++;
        if (table === "event_participants" && checkInCall === 1) return ch(PARTICIPANT);
        return ch(null);
      }),
    });
    const checkInRes = await checkIn(
      new NextRequest("http://localhost/api/events/check-in", {
        method: "POST",
        body: JSON.stringify({ token: VALID_TOKEN }),
      }),
    );
    expect(checkInRes.status).toBe(200);
    const checkInBody = await checkInRes.json();
    expect(checkInBody.valid).toBe(true);
    expect(checkInBody.already_checked_in).toBe(false);

    // Step 2: T-shirt issue
    let tshirtCall = 0;
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation(() => {
        tshirtCall++;
        return tshirtCall === 1 ? ch(FULL_REG) : ch(null);
      }),
    });
    const tshirtRes = await tshirtDistribute(
      makeReq("/api/events/tshirt-distribute", { token: VALID_TOKEN }),
    );
    expect(tshirtRes.status).toBe(200);
    const tshirtBody = await tshirtRes.json();
    expect(tshirtBody.already_issued).toBe(false);

    // Step 3: Breakfast mark
    let breakfastCall = 0;
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation(() => {
        breakfastCall++;
        return breakfastCall === 1 ? ch(FULL_REG) : ch(null);
      }),
    });
    const bfRes = await markBreakfast(
      makeReq("/api/events/mark-breakfast", { token: VALID_TOKEN, event_id: EVENT_ID }),
    );
    expect(bfRes.status).toBe(200);
    const bfBody = await bfRes.json();
    expect(bfBody.already_availed).toBe(false);
  });
});
