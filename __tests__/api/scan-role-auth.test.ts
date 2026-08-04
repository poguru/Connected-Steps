/**
 * Regression tests for volunteer role-based service authorization (Issue 2).
 *
 * Verifies that:
 *  • event_admin can invoke any service.
 *  • Specific roles (checkin, tshirt, breakfast, bib, medal, certificate) can
 *    only call their matching service.
 *  • Attempting an unauthorized service returns 403 ROLE_UNAUTHORIZED.
 *  • photography and sponsor roles cannot invoke any scan service.
 *  • registration_desk and support can only do checkin.
 *  • medical can only do checkin.
 *  • dry_run=true enforces the same authorization before preview.
 */

process.env.COACH_TOKEN_SECRET        = "test-coach-secret";
process.env.ADMIN_PASSWORD            = "test-admin-password";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/event-qr",        () => ({
  signEventQR:   jest.fn().mockReturnValue("mocked-qr"),
  verifyEventQR: jest.fn().mockReturnValue({
    eventId:          "evt-1",
    registrationCode: "CS-EVT-TEST1",
  }),
}));
jest.mock("@/lib/ops-auth", () => {
  const actual = jest.requireActual<typeof import("@/lib/ops-auth")>("@/lib/ops-auth");
  return {
    ...actual,
    getOpsSession: jest.fn(),
  };
});

import { NextRequest }     from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getOpsSession }   from "@/lib/ops-auth";
import { POST }            from "@/app/api/ops/events/[id]/scan/route";

const mockDb      = getSupabaseServer as jest.Mock;
const mockSession = getOpsSession     as jest.Mock;

// ── Participant fixture ────────────────────────────────────────────────────────
const PARTICIPANT = {
  id:              "part-1",
  event_id:        "evt-1",
  registration_id: "reg-1",
  account_email:   "runner@example.com",
  first_name:      "Test",
  last_name:       "Runner",
  distance_category: "5K",
  tshirt_size:     "M",
  bib_number:      null,
  wave:            null,
  checked_in_at:   null,
  checked_in_by:   null,
  tshirt_issued:        false,
  tshirt_issued_at:     null,
  tshirt_issued_by:     null,
  breakfast_availed:    false,
  breakfast_availed_at: null,
  breakfast_availed_by: null,
  medal_issued:         false,
  medal_issued_at:      null,
  medal_issued_by:      null,
  bib_collected_at:     null,
  bib_collected_by:     null,
  certificate_issued:   false,
  certificate_issued_at: null,
  certificate_issued_by: null,
  status: "active",
  event_registrations: { registration_code: "CS-EVT-TEST1", payment_status: "free", gender: "male" },
};

function ch(data: unknown, error: unknown = null) {
  const result = { data, error };
  const self: Record<string, jest.Mock> = {};
  for (const m of ["select","eq","is","in","update","insert","order","limit","neq"]) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  self.single      = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  self.maybeSingle = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  self.then        = jest.fn().mockImplementation((res: (v: unknown) => unknown) => Promise.resolve(result).then(res));
  return self;
}

function makeDb() {
  const db = {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "event_participants")  return ch(PARTICIPANT);
      if (table === "event_registrations") return ch(null);
      if (table === "event_service_logs")  return ch(null);
      return ch(null);
    }),
  };
  mockDb.mockReturnValue(db);
  return db;
}

function makeSession(role: string) {
  mockSession.mockReturnValue({ uid: "vol-1", eid: "evt-1", role, em: "vol@example.com", nm: "Volunteer" });
}

function makeReq(service: string, dryRun = false): NextRequest {
  return new NextRequest("http://localhost/api/ops/events/evt-1/scan", {
    method: "POST",
    body:   JSON.stringify({ service, qr_token: "mocked-qr-token", dry_run: dryRun }),
    headers: { "Content-Type": "application/json" },
  });
}

const PARAMS = { params: Promise.resolve({ id: "evt-1" }) };

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Volunteer Role Authorization", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    makeDb();
  });

  const SERVICES = ["checkin", "tshirt", "breakfast", "medal", "bib", "certificate"];

  // event_admin can do everything
  describe("event_admin", () => {
    it.each(SERVICES)("can invoke %s service", async (svc) => {
      makeSession("event_admin");
      const res = await POST(makeReq(svc), PARAMS);
      expect(res.status).not.toBe(403);
    });
  });

  // Single-service roles
  const SINGLE_ROLE_CASES: [string, string][] = [
    ["checkin",     "checkin"],
    ["tshirt",      "tshirt"],
    ["breakfast",   "breakfast"],
    ["bib",         "bib"],
    ["medal",       "medal"],
    ["certificate", "certificate"],
  ];

  describe("single-service roles can only access their own service", () => {
    it.each(SINGLE_ROLE_CASES)("role=%s allowed for service=%s", async (role, allowed) => {
      makeSession(role);
      const res = await POST(makeReq(allowed), PARAMS);
      expect(res.status).not.toBe(403);
    });

    it.each(SINGLE_ROLE_CASES)("role=%s blocked for any other service", async (role, allowed) => {
      makeSession(role);
      const blocked = SERVICES.filter(s => s !== allowed);
      for (const svc of blocked) {
        const res = await POST(makeReq(svc), PARAMS);
        expect(res.status).toBe(403);
        const body = await res.json() as { code: string };
        expect(body.code).toBe("ROLE_UNAUTHORIZED");
      }
    });
  });

  // Support roles (limited checkin access)
  describe("registration_desk / support / medical", () => {
    it.each(["registration_desk", "support", "medical"])("role=%s can only do checkin", async (role) => {
      makeSession(role);

      const checkInRes = await POST(makeReq("checkin"), PARAMS);
      expect(checkInRes.status).not.toBe(403);

      for (const svc of ["tshirt", "breakfast", "bib", "medal", "certificate"]) {
        const res = await POST(makeReq(svc), PARAMS);
        expect(res.status).toBe(403);
      }
    });
  });

  // Observer roles (no scan services)
  describe("photography / sponsor", () => {
    it.each(["photography", "sponsor"])("role=%s is blocked for all scan services", async (role) => {
      makeSession(role);
      for (const svc of SERVICES) {
        const res = await POST(makeReq(svc), PARAMS);
        expect(res.status).toBe(403);
        const body = await res.json() as { code: string };
        expect(body.code).toBe("ROLE_UNAUTHORIZED");
      }
    });
  });

  // Dry-run also enforces the authorization
  describe("dry_run respects role authorization", () => {
    it("breakfast role is blocked in dry_run for checkin service", async () => {
      makeSession("breakfast");
      const res = await POST(makeReq("checkin", true), PARAMS);
      expect(res.status).toBe(403);
    });

    it("checkin role can dry_run their own service", async () => {
      makeSession("checkin");
      const res = await POST(makeReq("checkin", true), PARAMS);
      expect(res.status).not.toBe(403);
    });
  });
});
