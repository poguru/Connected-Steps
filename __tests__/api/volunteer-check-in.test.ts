process.env.COACH_TOKEN_SECRET        = "test-coach-secret";
process.env.ADMIN_PASSWORD            = "test-admin-password";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth", () => {
  const actual = jest.requireActual<typeof import("@/lib/admin-auth")>("@/lib/admin-auth");
  return { ...actual, isAdminOrCoach: jest.fn() };
});

import { POST }              from "@/app/api/events/check-in/route";
import { NextRequest }       from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach }    from "@/lib/admin-auth";
import { signEventQR }       from "@/lib/event-qr";

const mockDb    = getSupabaseServer as jest.Mock;
const mockAuth  = isAdminOrCoach    as jest.Mock;

const EVENT_ID = "evt-abc";
const REG_CODE = "CS-EVT-CHECK1";

// ── Chainable mock ─────────────────────────────────────────────────────────────

function ch(data: unknown, error: unknown = null): Record<string, jest.Mock> {
  const result = { data, error };
  const self: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;

  for (const m of ["select", "eq", "neq", "order", "limit", "is", "not", "filter"]) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  self.single      = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  self.maybeSingle = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  self.update      = jest.fn().mockImplementation(() => ch(null));
  self.then        = jest.fn().mockImplementation(
    (res: (v: unknown) => unknown, rej?: (v: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  );
  return self;
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const VALID_TOKEN = signEventQR(REG_CODE, EVENT_ID);

const PARTICIPANT_ROW = {
  id:              "part-1",
  registration_id: "reg-1",
  first_name:      "Alice",
  last_name:       "Smith",
  distance_category: "5K",
  tshirt_size:     "M",
  bib_number:      "001",
  checked_in_at:   null,
  checked_in_by:   null,
  status:          "active",
  event_id:        EVENT_ID,
  events:          { title: "City Run 2026" },
  event_registrations: { registration_code: REG_CODE },
};

const REG_ROW = {
  id:                "reg-1",
  registration_code: REG_CODE,
  user_name:         "Alice Smith",
  user_email:        "alice@test.com",
  status:            "confirmed",
  payment_status:    "paid",
  distance_category: "5K",
  tshirt_size:       "M",
  checked_in_at:     null,
  events:            { title: "City Run 2026", start_date: "2026-12-01", location: "Kondapur" },
};

// ── DB factory ─────────────────────────────────────────────────────────────────

interface DbCfg {
  participant?: unknown;   // null → fall through to legacy path
  reg?:         unknown;
  updateError?: boolean;
}

function makeDb(cfg: DbCfg = {}): ReturnType<typeof getSupabaseServer> {
  const { participant = null, reg = REG_ROW, updateError = false } = cfg;

  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "event_participants") {
        const p = participant as (typeof PARTICIPANT_ROW) | null;
        // Override update to simulate DB error on write if needed
        const chain = ch(p);
        chain.update = jest.fn().mockImplementation(() => {
          const inner = ch(null, updateError ? { message: "db error" } : null);
          // Return result when awaited (for .update().eq() pattern)
          for (const m of ["eq", "neq"]) {
            inner[m] = jest.fn().mockReturnValue(inner);
          }
          inner.then = jest.fn().mockImplementation(
            (res: (v: unknown) => unknown, rej?: (v: unknown) => unknown) =>
              Promise.resolve({ data: null, error: updateError ? { message: "db error" } : null }).then(res, rej),
          );
          return inner;
        });
        return chain;
      }

      if (table === "event_registrations") {
        const chain = ch(reg);
        chain.update = jest.fn().mockImplementation(() => {
          const inner = ch(null, updateError ? { message: "db error" } : null);
          for (const m of ["eq", "neq"]) inner[m] = jest.fn().mockReturnValue(inner);
          inner.then = jest.fn().mockImplementation(
            (res: (v: unknown) => unknown, rej?: (v: unknown) => unknown) =>
              Promise.resolve({ data: null, error: updateError ? { message: "db error" } : null }).then(res, rej),
          );
          return inner;
        });
        return chain;
      }

      return ch(null);
    }),
  } as unknown as ReturnType<typeof getSupabaseServer>;
}

// ── Request helpers ────────────────────────────────────────────────────────────

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/events/check-in", {
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
// Auth
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/events/check-in — auth", () => {
  test("returns 401 when caller is not an admin or coach", async () => {
    mockAuth.mockResolvedValue(false);
    mockDb.mockReturnValue(makeDb());
    const res = await POST(makeReq({ token: VALID_TOKEN }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Input validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/events/check-in — input validation", () => {
  test("returns 400 when token is missing from request body", async () => {
    mockDb.mockReturnValue(makeDb());
    const res  = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/token is required/i);
  });

  test("returns 400 for a tampered or invalid QR token", async () => {
    mockDb.mockReturnValue(makeDb());
    const res  = await POST(makeReq({ token: "invalid.tampered.token" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid qr/i);
  });

  test("returns 400 when request body is malformed JSON", async () => {
    const req = new NextRequest("http://localhost/api/events/check-in", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    "not-json",
    });
    mockDb.mockReturnValue(makeDb());
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Participant-based QR path (new model)
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/events/check-in — participant QR path", () => {
  test("checks in a participant and returns valid:true", async () => {
    mockDb.mockReturnValue(makeDb({ participant: PARTICIPANT_ROW }));
    const res  = await POST(makeReq({ token: VALID_TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.already_checked_in).toBe(false);
    expect(body.registration.name).toBe("Alice Smith");
  });

  test("returns already_checked_in:true for duplicate scan on participant", async () => {
    const alreadyIn = { ...PARTICIPANT_ROW, checked_in_at: "2026-12-01T06:05:00.000Z" };
    mockDb.mockReturnValue(makeDb({ participant: alreadyIn }));
    const res  = await POST(makeReq({ token: VALID_TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.already_checked_in).toBe(true);
    expect(body.message).toMatch(/already checked in/i);
  });

  test("returns 409 for a cancelled participant", async () => {
    const cancelled = { ...PARTICIPANT_ROW, status: "cancelled" };
    mockDb.mockReturnValue(makeDb({ participant: cancelled }));
    const res  = await POST(makeReq({ token: VALID_TOKEN }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.error).toMatch(/cancelled/i);
  });

  test("returns 409 for a participant with pending_payment status", async () => {
    const pending = { ...PARTICIPANT_ROW, status: "pending_payment" };
    mockDb.mockReturnValue(makeDb({ participant: pending }));
    const res  = await POST(makeReq({ token: VALID_TOKEN }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.error).toMatch(/payment not completed/i);
  });

  test("returns 500 when the database update fails", async () => {
    mockDb.mockReturnValue(makeDb({ participant: PARTICIPANT_ROW, updateError: true }));
    const res  = await POST(makeReq({ token: VALID_TOKEN }));
    expect(res.status).toBe(500);
  });

  test("response includes registration details (code, category, bib)", async () => {
    mockDb.mockReturnValue(makeDb({ participant: PARTICIPANT_ROW }));
    const res  = await POST(makeReq({ token: VALID_TOKEN }));
    const body = await res.json();
    expect(body.registration.code).toBe(REG_CODE);
    expect(body.registration.category).toBe("5K");
    expect(body.registration.bib_number).toBe("001");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Legacy registration QR path
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/events/check-in — legacy registration QR path", () => {
  test("returns 404 when registration code is not found in legacy path", async () => {
    // participant = null → falls through to legacy; reg = null → 404
    mockDb.mockReturnValue(makeDb({ participant: null, reg: null }));
    const res  = await POST(makeReq({ token: VALID_TOKEN }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  test("returns 409 for a cancelled legacy registration", async () => {
    mockDb.mockReturnValue(makeDb({ participant: null, reg: { ...REG_ROW, status: "cancelled" } }));
    const res  = await POST(makeReq({ token: VALID_TOKEN }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/cancelled/i);
  });

  test("returns 409 when legacy registration is not confirmed", async () => {
    mockDb.mockReturnValue(makeDb({ participant: null, reg: { ...REG_ROW, status: "pending_payment" } }));
    const res  = await POST(makeReq({ token: VALID_TOKEN }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/not confirmed/i);
  });

  test("checks in a legacy registration on first scan", async () => {
    mockDb.mockReturnValue(makeDb({ participant: null, reg: REG_ROW }));
    const res  = await POST(makeReq({ token: VALID_TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.already_checked_in).toBe(false);
    expect(body.registration.name).toBe("Alice Smith");
    expect(body.registration.code).toBe(REG_CODE);
  });

  test("returns already_checked_in:true on duplicate scan for legacy registration", async () => {
    const checkedIn = { ...REG_ROW, checked_in_at: "2026-12-01T06:00:00.000Z" };
    mockDb.mockReturnValue(makeDb({ participant: null, reg: checkedIn }));
    const res  = await POST(makeReq({ token: VALID_TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.already_checked_in).toBe(true);
    expect(body.message).toMatch(/already checked in/i);
  });

  test("returns 500 when the database update fails on legacy path", async () => {
    mockDb.mockReturnValue(makeDb({ participant: null, reg: REG_ROW, updateError: true }));
    const res  = await POST(makeReq({ token: VALID_TOKEN }));
    expect(res.status).toBe(500);
  });

  test("response includes event title from join", async () => {
    mockDb.mockReturnValue(makeDb({ participant: null, reg: REG_ROW }));
    const res  = await POST(makeReq({ token: VALID_TOKEN }));
    const body = await res.json();
    expect(body.registration.event).toBe("City Run 2026");
  });
});
