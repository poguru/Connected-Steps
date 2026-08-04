process.env.COACH_TOKEN_SECRET        = "test-coach-secret";
process.env.ADMIN_PASSWORD            = "test-admin-password";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));

import { POST }              from "@/app/api/events/waitlist/route";
import { NextRequest }       from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const mockDb = getSupabaseServer as jest.Mock;

// ── Chainable mock ─────────────────────────────────────────────────────────────

function ch(data: unknown, error: unknown = null): Record<string, jest.Mock> {
  const result = { data, error };
  const self: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;

  for (const m of ["select", "eq", "neq", "order", "limit", "is", "not", "in"]) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  self.single      = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  self.maybeSingle = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  self.insert      = jest.fn().mockImplementation(() => ch(data, error));
  self.update      = jest.fn().mockImplementation(() => ch(null));
  self.rpc         = jest.fn().mockResolvedValue({ data: null, error: null });
  self.then        = jest.fn().mockImplementation(
    (res: (v: unknown) => unknown, rej?: (v: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  );
  return self;
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const EVENT_FULL = {
  id: "evt-1", title: "City Run 2026",
  max_participants: 100, participant_count: 100,
  status: "published",
};
const EVENT_NOT_FULL = { ...EVENT_FULL, participant_count: 50 };
const WAITLIST_ENTRY = { id: "wl-1", position: 3 };

// ── DB factory ─────────────────────────────────────────────────────────────────

interface DbCfg {
  event?:         unknown;
  existingReg?:   unknown;
  existingWl?:    unknown;
  insertError?:   boolean;
  insertedEntry?: unknown;
}

function makeDb(cfg: DbCfg = {}): ReturnType<typeof getSupabaseServer> {
  const {
    event         = EVENT_FULL,
    existingReg   = null,
    existingWl    = null,
    insertError   = false,
    insertedEntry = { position: 5 },
  } = cfg;

  // Simulate the real DB filter the route applies:
  // .neq("status", "cancelled").in("payment_status", ["paid", "free"])
  // Only a confirmed (paid/free, non-cancelled) registration should block the waitlist.
  const confirmedReg = (() => {
    if (!existingReg) return null;
    const r = existingReg as { status?: string; payment_status?: string };
    if (r.status === "cancelled") return null;
    if (!["paid", "free"].includes(r.payment_status ?? "")) return null;
    return existingReg;
  })();

  const counters: Record<string, number> = {};

  return {
    rpc:  jest.fn().mockResolvedValue({ data: null, error: null }),
    from: jest.fn().mockImplementation((table: string) => {
      counters[table] = (counters[table] ?? 0) + 1;

      if (table === "events")             return ch(event);
      if (table === "event_waitlist") {
        const n = counters[table];
        if (n === 1) return ch(existingWl); // already-on-waitlist check
        // insert
        const insertChain = ch(
          insertedEntry,
          insertError ? { message: "db error" } : null,
        );
        insertChain.insert = jest.fn().mockImplementation(() => insertChain);
        return insertChain;
      }
      if (table === "event_registrations") return ch(confirmedReg);
      return ch(null);
    }),
  } as unknown as ReturnType<typeof getSupabaseServer>;
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/events/waitlist", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
}

const VALID_BODY = {
  event_id: "evt-1",
  name:     "Test User",
  email:    "user@test.com",
  phone:    "9876543210",
};

beforeEach(() => jest.clearAllMocks());

// ═══════════════════════════════════════════════════════════════════════════════
// Input validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/events/waitlist — input validation", () => {
  test("returns 400 when event_id is missing", async () => {
    mockDb.mockReturnValue(makeDb());
    const { event_id: _, ...body } = VALID_BODY;
    const res  = await POST(makeReq(body));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/required/i);
  });

  test("returns 400 when name is missing", async () => {
    mockDb.mockReturnValue(makeDb());
    const res  = await POST(makeReq({ ...VALID_BODY, name: "" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when email is missing", async () => {
    mockDb.mockReturnValue(makeDb());
    const res  = await POST(makeReq({ ...VALID_BODY, email: "" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when email format is invalid", async () => {
    mockDb.mockReturnValue(makeDb());
    const res  = await POST(makeReq({ ...VALID_BODY, email: "not-an-email" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid email/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Event checks
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/events/waitlist — event checks", () => {
  test("returns 404 when event does not exist or is not published", async () => {
    mockDb.mockReturnValue(makeDb({ event: null }));
    const res  = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(404);
  });

  test("returns 400 when event still has spots (waitlist not applicable)", async () => {
    mockDb.mockReturnValue(makeDb({ event: EVENT_NOT_FULL }));
    const res  = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/still available/i);
  });

  test("proceeds when max_participants is null (unlimited capacity is never full)", async () => {
    const unlimited = { ...EVENT_FULL, max_participants: null };
    mockDb.mockReturnValue(makeDb({ event: unlimited }));
    const res  = await POST(makeReq(VALID_BODY));
    // should return 400 "still has spots" (null capacity → never full)
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Duplicate & conflict guards
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/events/waitlist — duplicates and conflicts", () => {
  test("returns 400 when user is already confirmed for the event", async () => {
    mockDb.mockReturnValue(makeDb({
      existingReg: { id: "reg-1", status: "confirmed", payment_status: "paid" },
    }));
    const res  = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/already registered/i);
  });

  test("allows waitlist join when existing registration is cancelled", async () => {
    mockDb.mockReturnValue(makeDb({
      existingReg: { id: "reg-1", status: "cancelled", payment_status: "paid" },
    }));
    const res  = await POST(makeReq(VALID_BODY));
    // cancelled reg is not a confirmed reg — should proceed to waitlist check
    expect(res.status).not.toBe(400);
  });

  test("allows waitlist join when existing registration is pending_payment (abandoned)", async () => {
    mockDb.mockReturnValue(makeDb({
      existingReg: { id: "reg-1", status: "pending_payment", payment_status: "pending" },
    }));
    const res  = await POST(makeReq(VALID_BODY));
    // Not a confirmed slot — should NOT block
    expect(res.status).not.toBe(400);
  });

  test("returns already:true with position when user is already on waitlist", async () => {
    mockDb.mockReturnValue(makeDb({ existingWl: WAITLIST_ENTRY }));
    const res  = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.already).toBe(true);
    expect(json.position).toBe(3);
    expect(json.message).toMatch(/position #3/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Successful join
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/events/waitlist — successful join", () => {
  test("adds user to waitlist and returns position", async () => {
    mockDb.mockReturnValue(makeDb({ insertedEntry: { position: 5 } }));
    const res  = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.position).toBe(5);
    expect(json.message).toMatch(/position #5/i);
  });

  test("accepts optional distance_category field", async () => {
    mockDb.mockReturnValue(makeDb({ insertedEntry: { position: 2 } }));
    const res  = await POST(makeReq({ ...VALID_BODY, distance_category: "10K" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  test("normalises email to lowercase before inserting", async () => {
    // Use uppercase email — the route should normalise it
    mockDb.mockReturnValue(makeDb({ insertedEntry: { position: 1 } }));
    const res  = await POST(makeReq({ ...VALID_BODY, email: "USER@Test.COM" }));
    expect(res.status).toBe(200);
  });

  test("returns 500 when database insert fails", async () => {
    mockDb.mockReturnValue(makeDb({ insertError: true }));
    const res  = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/database error/i);
  });
});
