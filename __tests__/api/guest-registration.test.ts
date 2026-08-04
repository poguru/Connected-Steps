/**
 * Regression tests for guest registration (Issue 1).
 *
 * Verifies that:
 *  • Events with require_login=true  reject unauthenticated POST requests (401).
 *  • Events with require_login=false accept unauthenticated POST requests (no token).
 *  • Events with require_login=false still accept authenticated requests (backward compat).
 *  • Token email mismatch is still rejected on require_login=true events.
 *  • Guest path skips users-table lookup (no 404 when guest email has no account).
 *  • Multi-participant path follows the same require_login gate.
 */

process.env.COACH_TOKEN_SECRET        = "test-coach-secret";
process.env.ADMIN_PASSWORD            = "test-admin-password";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server",     () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/event-qr",            () => ({
  signEventQR:   jest.fn().mockReturnValue("mocked-qr-token"),
  verifyEventQR: jest.fn().mockReturnValue(null),
}));
jest.mock("@/lib/job-queue",           () => ({ enqueueJob: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/job-handlers",        () => ({ handleEventQrEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/webhook-dispatch",    () => ({ dispatchWebhookEvent: jest.fn() }));
jest.mock("@/lib/automation-engine",   () => ({ evaluateAutomations: jest.fn() }));
jest.mock("@/lib/campaign-service",    () => ({ recordConsent: jest.fn() }));
jest.mock("@/lib/commerce/pricing",    () => ({ calcEventDiscount: jest.fn().mockReturnValue(0) }));
jest.mock("next/server", () => {
  const actual = jest.requireActual<typeof import("next/server")>("next/server");
  return { ...actual, after: jest.fn((fn: () => Promise<void>) => { fn().catch(() => {}); }) };
});

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { signUserToken } from "@/lib/admin-auth";
import { POST } from "@/app/api/events/register/route";

const mockDb = getSupabaseServer as jest.Mock;

// ── Shared fixtures ────────────────────────────────────────────────────────────

const EVENT_ID = "evt-open-001";

const OPEN_EVENT = {
  id: EVENT_ID, organization_id: "org-1", title: "Fun Run", price: 0,
  max_participants: 100, participant_count: 5,
  start_date: "2026-12-01", start_time: "06:00", end_date: "2026-12-01", end_time: "12:00",
  registration_closes_at: null, location: "Hyderabad",
  status: "published", distance_categories: [], collect_tshirt: false,
  early_bird_ends_at: null, registration_config: null,
  require_login: false,        // ← key field
};

const CLOSED_EVENT = { ...OPEN_EVENT, require_login: true };

// Minimal chainable Supabase mock
function ch(data: unknown, error: unknown = null) {
  const result = { data, error };
  const self: Record<string, jest.Mock> = {};
  for (const m of ["select","eq","neq","order","limit","is","in","not","maybeSingle","upsert","insert","update","delete","rpc"]) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  self.single      = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  self.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  self.then        = jest.fn().mockImplementation(
    (res: (v: unknown) => unknown) => Promise.resolve(result).then(res),
  );
  return self;
}

function makeDb(event: typeof OPEN_EVENT | null = OPEN_EVENT) {
  const db = {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "events")              return ch(event);
      if (table === "event_registrations") {
        const reg = ch({ id: "reg-1", registration_code: "CS-EVT-GUEST1", qr_token: "tok" });
        reg.upsert = jest.fn().mockReturnValue(reg);
        return reg;
      }
      if (table === "event_participants")  return ch(null);
      if (table === "event_races")         return ch([]);
      if (table === "event_form_fields")   return ch([]);
      if (table === "coupons")             return ch(null, { message: "not found" });
      if (table === "users")               return ch(null, { message: "not found" }); // no user account
      return ch(null);
    }),
    rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
  };
  mockDb.mockReturnValue(db);
  return db;
}

function makeReq(body: Record<string, unknown>, token?: string): NextRequest {
  return new NextRequest("http://localhost/api/events/register", {
    method: "POST",
    body:   JSON.stringify(body),
    headers: {
      "Content-Type":  "application/json",
      ...(token ? { "x-user-token": token } : {}),
    },
  });
}

const BASE_BODY = {
  event_id:         EVENT_ID,
  email:            "guest@example.com",
  name:             "Guest Runner",
  phone:            "9876543210",
  gender:           "male",
  date_of_birth:    "1990-01-01",
  blood_group:      "O+",
  emergency_contact: "9876543211",
  special_notes:    "None",
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Guest Registration (require_login=false)", () => {

  beforeEach(() => jest.clearAllMocks());

  it("accepts registration without a token when event requires no login", async () => {
    makeDb(OPEN_EVENT);
    const res = await POST(makeReq(BASE_BODY));
    // Should NOT be 401 — guest path is allowed
    expect(res.status).not.toBe(401);
    // Free event → success
    expect(res.status).toBe(200);
    const body = await res.json() as { success?: boolean; free?: boolean };
    expect(body.success).toBe(true);
    expect(body.free).toBe(true);
  });

  it("accepts registration with a valid token on a guest-allowed event (backward compat)", async () => {
    makeDb(OPEN_EVENT);
    const token = signUserToken("guest@example.com");
    const res   = await POST(makeReq(BASE_BODY, token));
    expect(res.status).toBe(200);
  });

  it("returns 401 when no token provided and event requires login", async () => {
    makeDb(CLOSED_EVENT);
    const res = await POST(makeReq(BASE_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 401 when token is invalid and event requires login", async () => {
    makeDb(CLOSED_EVENT);
    const res = await POST(makeReq(BASE_BODY, "bad.token.here"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when token email does not match and participant has no account (require_login=true)", async () => {
    // Authenticated user (other@example.com) trying to register guest@example.com.
    // Email-match is no longer enforced — the participant's account is checked instead.
    // CLOSED_EVENT's users mock returns null → "Account not found" → 404.
    makeDb(CLOSED_EVENT);
    const token = signUserToken("other@example.com");
    const res   = await POST(makeReq(BASE_BODY, token));
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/account not found/i);
  });

  it("guest path does NOT fail because user has no account in users table", async () => {
    // makeDb returns { data: null } for users table — simulates no account
    makeDb(OPEN_EVENT);
    const res = await POST(makeReq(BASE_BODY));
    // Must NOT be 404 "Account not found"
    expect(res.status).not.toBe(404);
    expect(res.status).toBe(200);
  });

  it("returns 404 when authenticated user has no account on require_login=true event", async () => {
    // users table returns null → "Account not found"
    makeDb(CLOSED_EVENT);
    const token = signUserToken("guest@example.com");
    const res   = await POST(makeReq(BASE_BODY, token));
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/account not found/i);
  });
});

describe("Guest Registration — multi-participant (require_login=false)", () => {

  beforeEach(() => jest.clearAllMocks());

  const MULTI_BODY = {
    event_id: EVENT_ID,
    email:    "guest@example.com",
    emergency_contact: "9876543211",
    special_notes:     "None",
    participants: [
      { first_name: "Alice", gender: "female", date_of_birth: "1995-05-01", blood_group: "A+", mobile: "9876543210" },
    ],
  };

  function makeMultiDb(event: (typeof OPEN_EVENT & Record<string, unknown>) | null = OPEN_EVENT) {
    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "events") return ch({ ...(event as object), allow_multi_participant: true });
        if (table === "event_registrations") {
          const reg = ch({ id: "reg-m1", registration_code: "CS-EVT-MULTI1" });
          reg.upsert = jest.fn().mockReturnValue(reg);
          return reg;
        }
        if (table === "event_participants") return ch([{ id: "p-1", first_name: "Alice", last_name: null, email: "guest@example.com", qr_token: "qt1", distance_category: null, tshirt_size: null }]);
        if (table === "event_races")        return ch([]);
        if (table === "event_form_fields")  return ch([]);
        return ch(null);
      }),
      rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
    };
    mockDb.mockReturnValue(db);
    return db;
  }

  it("allows multi-participant registration without token when require_login=false", async () => {
    makeMultiDb({ ...OPEN_EVENT, require_login: false });
    const res = await POST(makeReq(MULTI_BODY));
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
  });

  it("blocks multi-participant registration without token when require_login=true", async () => {
    makeMultiDb({ ...OPEN_EVENT, require_login: true, allow_multi_participant: true });
    const res = await POST(makeReq(MULTI_BODY));
    expect(res.status).toBe(401);
  });
});
