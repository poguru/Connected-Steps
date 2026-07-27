process.env.COACH_TOKEN_SECRET        = "test-coach-secret";
process.env.ADMIN_PASSWORD            = "test-admin-password";
process.env.USER_TOKEN_SECRET         = "test-user-secret";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth", () => {
  const actual = jest.requireActual<typeof import("@/lib/admin-auth")>("@/lib/admin-auth");
  return { ...actual, verifyUserToken: jest.fn() };
});

import { GET }               from "@/app/api/events/my-registrations/route";
import { NextRequest }       from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken }   from "@/lib/admin-auth";

const mockDb     = getSupabaseServer as jest.Mock;
const mockVerify = verifyUserToken    as jest.Mock;

const EMAIL = "runner@test.com";
const TOKEN = "test-token";

// ── Chainable mock ─────────────────────────────────────────────────────────────
// Supports .in() (needed by this route) and direct-await pattern.

function ch(data: unknown, error: unknown = null): Record<string, jest.Mock> {
  const result = { data, error };
  const self: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;

  for (const m of ["select", "eq", "neq", "order", "limit", "in", "not", "filter"]) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  self.single      = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  self.maybeSingle = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  self.then        = jest.fn().mockImplementation(
    (res: (v: unknown) => unknown, rej?: (v: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  );
  return self;
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const REG1 = {
  id: "reg-1", registration_code: "CS-EVT-TEST1",
  payment_status: "paid", status: "confirmed",
  created_at: "2026-10-01T10:00:00Z",
  original_price: 999, coupon_discount: 0, final_price: 999,
  event_id: "evt-1", distance_category: "10K",
  qr_token: "qr-token-1", checked_in_at: null, participant_count: 1,
};
const REG2 = {
  id: "reg-2", registration_code: "CS-EVT-TEST2",
  payment_status: "free", status: "confirmed",
  created_at: "2026-09-01T10:00:00Z",
  original_price: 0, coupon_discount: 0, final_price: 0,
  event_id: "evt-2", distance_category: "5K",
  qr_token: "qr-token-2", checked_in_at: null, participant_count: 1,
};
const EVENT1 = { id: "evt-1", title: "City Marathon 2026", event_type: "race", start_date: "2026-12-01" };
const EVENT2 = { id: "evt-2", title: "Fun Run 2026",       event_type: "race", start_date: "2026-11-01" };
const PARTICIPANT1 = {
  id: "part-1", registration_id: "reg-1",
  first_name: "Test", last_name: "Runner",
  distance_category: "10K", tshirt_size: "M",
  qr_token: "qr-token-1", checked_in_at: null,
  tshirt_issued: false, breakfast_availed: false,
  medal_issued: false, bib_collected_at: null, bib_number: null,
  certificate_url: null, status: "active",
};
const INVOICE1  = { registration_id: "reg-1", invoice_number: "INV-2026-001" };

// ── DB factory ─────────────────────────────────────────────────────────────────

interface DbCfg {
  regs?:        unknown[] | null;
  regsError?:   boolean;
  events?:      unknown[];
  participants?: unknown[];
  invoices?:    unknown[];
  catChanges?:  unknown[];
}

function makeDb(cfg: DbCfg = {}): ReturnType<typeof getSupabaseServer> {
  const {
    regs         = [REG1],
    regsError    = false,
    events       = [EVENT1],
    participants = [PARTICIPANT1],
    invoices     = [INVOICE1],
    catChanges   = [],
  } = cfg;

  const counters: Record<string, number> = {};

  return {
    from: jest.fn().mockImplementation((table: string) => {
      counters[table] = (counters[table] ?? 0) + 1;

      if (table === "event_registrations") return ch(regs, regsError ? { message: "db error" } : null);
      if (table === "events")              return ch(events);
      if (table === "event_participants")  return ch(participants);
      if (table === "invoices")            return ch(invoices);
      if (table === "category_change_requests") return ch(catChanges);
      return ch(null);
    }),
  } as unknown as ReturnType<typeof getSupabaseServer>;
}

function makeReq(): NextRequest {
  return new NextRequest("http://localhost/api/events/my-registrations", {
    headers: { "x-user-token": TOKEN },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockReturnValue(EMAIL);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Auth
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/events/my-registrations — auth", () => {
  test("returns 401 when x-user-token header is missing", async () => {
    const req = new NextRequest("http://localhost/api/events/my-registrations");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  test("returns 401 when token is invalid", async () => {
    mockVerify.mockReturnValue(null);
    mockDb.mockReturnValue(makeDb());
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Happy path
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/events/my-registrations — happy path", () => {
  test("returns registrations array for authenticated user", async () => {
    mockDb.mockReturnValue(makeDb());
    const res  = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.registrations).toHaveLength(1);
    expect(body.registrations[0].registration_code).toBe("CS-EVT-TEST1");
  });

  test("returns empty array when user has no registrations", async () => {
    mockDb.mockReturnValue(makeDb({ regs: [] }));
    const res  = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.registrations).toEqual([]);
  });

  test("nests participants under each registration", async () => {
    mockDb.mockReturnValue(makeDb());
    const res  = await GET(makeReq());
    const body = await res.json();
    expect(body.registrations[0].participants).toHaveLength(1);
    expect(body.registrations[0].participants[0].first_name).toBe("Test");
  });

  test("attaches event data to each registration", async () => {
    mockDb.mockReturnValue(makeDb());
    const res  = await GET(makeReq());
    const body = await res.json();
    expect(body.registrations[0].events.title).toBe("City Marathon 2026");
  });

  test("includes invoice_number when invoice exists", async () => {
    mockDb.mockReturnValue(makeDb());
    const res  = await GET(makeReq());
    const body = await res.json();
    expect(body.registrations[0].invoice_number).toBe("INV-2026-001");
  });

  test("invoice_number is null when no invoice exists", async () => {
    mockDb.mockReturnValue(makeDb({ invoices: [] }));
    const res  = await GET(makeReq());
    const body = await res.json();
    expect(body.registrations[0].invoice_number).toBeNull();
  });

  test("includes pending_category_change when a pending change exists", async () => {
    const catChange = {
      registration_id: "reg-1",
      status: "pending",
      old_category: "5K",
      new_category: "10K",
      created_at: "2026-10-15T08:00:00Z",
    };
    mockDb.mockReturnValue(makeDb({ catChanges: [catChange] }));
    const res  = await GET(makeReq());
    const body = await res.json();
    expect(body.registrations[0].pending_category_change).toEqual({
      old_category: "5K",
      new_category: "10K",
    });
  });

  test("pending_category_change is null when no pending change exists", async () => {
    mockDb.mockReturnValue(makeDb({ catChanges: [] }));
    const res  = await GET(makeReq());
    const body = await res.json();
    expect(body.registrations[0].pending_category_change).toBeNull();
  });

  test("returns multiple registrations across different events", async () => {
    mockDb.mockReturnValue(makeDb({
      regs:     [REG1, REG2],
      events:   [EVENT1, EVENT2],
      participants: [
        PARTICIPANT1,
        { ...PARTICIPANT1, id: "part-2", registration_id: "reg-2", distance_category: "5K" },
      ],
      invoices: [],
    }));
    const res  = await GET(makeReq());
    const body = await res.json();
    expect(body.registrations).toHaveLength(2);
    expect(body.registrations[0].events.title).toBe("City Marathon 2026");
    expect(body.registrations[1].events.title).toBe("Fun Run 2026");
  });

  test("participants list is empty when no participants exist for a registration", async () => {
    mockDb.mockReturnValue(makeDb({ participants: [] }));
    const res  = await GET(makeReq());
    const body = await res.json();
    expect(body.registrations[0].participants).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Error handling
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/events/my-registrations — error handling", () => {
  test("returns 500 when the database query fails", async () => {
    mockDb.mockReturnValue(makeDb({ regsError: true }));
    const res  = await GET(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/database error/i);
  });
});
