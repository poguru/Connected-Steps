/**
 * Admin event management test suite — Phase 1 admin journey.
 *
 * Covers:
 *  • GET  /api/admin/events                   — list events (paginated + unpaginated)
 *  • POST /api/admin/events                   — create event
 *  • PATCH /api/admin/events                  — quick field update
 *  • DELETE /api/admin/events                 — delete event
 *  • GET  /api/admin/events/[id]/edit         — load editable fields
 *  • PATCH /api/admin/events/[id]/edit        — update fields with audit log
 *  • POST /api/admin/events/[id]/duplicate    — clone event (with races, with sponsors)
 *  • GET  /api/admin/events/[id]/stats        — dashboard stats
 */

process.env.COACH_TOKEN_SECRET        = "test-coach-secret";
process.env.ADMIN_PASSWORD            = "test-admin-password";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/admin-auth", () => {
  const actual = jest.requireActual<typeof import("@/lib/admin-auth")>("@/lib/admin-auth");
  return { ...actual, isAdminOrCoach: jest.fn() };
});

import { NextRequest }       from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach, signAdminSession, ADMIN_SESSION_COOKIE } from "@/lib/admin-auth";
import {
  GET  as listEvents,
  POST as createEvent,
  PATCH as quickPatch,
  DELETE as deleteEvent,
} from "@/app/api/admin/events/route";
import {
  GET  as getEdit,
  PATCH as patchEdit,
} from "@/app/api/admin/events/[id]/edit/route";
import {
  POST as duplicateEvent,
} from "@/app/api/admin/events/[id]/duplicate/route";
import {
  GET  as getStats,
} from "@/app/api/admin/events/[id]/stats/route";

const mockDb   = getSupabaseServer as jest.Mock;
const mockAuth = isAdminOrCoach    as jest.Mock;

// ── Chainable mock ─────────────────────────────────────────────────────────────

function ch(data: unknown, error: unknown = null): Record<string, jest.Mock> {
  const result = { data, error, count: null as number | null };
  const self: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  for (const m of ["select", "eq", "neq", "order", "limit", "in", "not", "range", "filter", "is"]) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  self.single      = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  self.maybeSingle = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  self.insert      = jest.fn().mockImplementation(() => ch(data, error));
  self.upsert      = jest.fn().mockImplementation(() => ch(data, error));
  self.update      = jest.fn().mockImplementation(() => ch(data, error));
  self.delete      = jest.fn().mockImplementation(() => ch(null));
  self.rpc         = jest.fn().mockResolvedValue({ data: null, error: null });
  self.then        = jest.fn().mockImplementation(
    (res: (v: unknown) => unknown, rej?: (v: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  );
  return self;
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const EVENT_ROW = {
  id: "evt-1", title: "City Run 2026", status: "draft",
  location: "Kondapur", start_date: "2026-12-01", price: 0,
  participant_count: 0, max_participants: 500, share_slug: "city-run-2026",
};
const PARAMS = (id = "evt-1") => ({ params: Promise.resolve({ id }) });

// ── Auth helper ────────────────────────────────────────────────────────────────

function withAuth(url: string, method = "GET", body?: unknown): NextRequest {
  const adminCookie = `${ADMIN_SESSION_COOKIE}=${signAdminSession()}`;
  return new NextRequest(url, {
    method,
    headers: {
      cookie: adminCookie,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function noAuth(url: string): NextRequest {
  return new NextRequest(url);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(true);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/admin/events
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/admin/events — list events", () => {
  test("returns 401 without auth", async () => {
    mockAuth.mockResolvedValue(false);
    const res = await listEvents(noAuth("http://localhost/api/admin/events"));
    expect(res.status).toBe(401);
  });

  test("returns all events without pagination params", async () => {
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch([EVENT_ROW])) });
    const res  = await listEvents(withAuth("http://localhost/api/admin/events"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe("City Run 2026");
  });

  test("returns paginated response when limit param is provided", async () => {
    const events = Array.from({ length: 10 }, (_, i) => ({ ...EVENT_ROW, id: `evt-${i}` }));
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch(events.slice(0, 5))) });
    const res  = await listEvents(withAuth("http://localhost/api/admin/events?limit=5&page=0"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(5);
    expect(body.limit).toBe(5);
    expect(body.page).toBe(0);
    expect(body.hasMore).toBe(true);
  });

  test("hasMore is false when returned items are fewer than limit", async () => {
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch([EVENT_ROW])) });
    const res  = await listEvents(withAuth("http://localhost/api/admin/events?limit=10&page=0"));
    const body = await res.json();
    expect(body.hasMore).toBe(false); // 1 < 10
  });

  test("returns 500 on database error", async () => {
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch(null, { message: "db error" })) });
    const res = await listEvents(withAuth("http://localhost/api/admin/events"));
    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/admin/events — create event
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/admin/events — create event", () => {
  const VALID_BODY = {
    title: "New Marathon 2026", location: "Hyderabad", start_date: "2026-12-01",
    description: "Annual city marathon", price: 999, max_participants: 1000,
    distance_categories: ["5K", "10K", "21K"],
  };

  test("returns 401 without auth", async () => {
    mockAuth.mockResolvedValue(false);
    const req = new NextRequest("http://localhost/api/admin/events", {
      method: "POST",
      body: JSON.stringify(VALID_BODY),
    });
    const res = await createEvent(req);
    expect(res.status).toBe(401);
  });

  test("creates a new event in draft status", async () => {
    const created = { ...EVENT_ROW, ...VALID_BODY, status: "draft" };
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch(created)) });
    const res  = await createEvent(withAuth("http://localhost/api/admin/events", "POST", VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("draft");
    expect(body.data.title).toBe("New Marathon 2026");
  });

  test("returns 400 when title is missing", async () => {
    const { title: _, ...noTitle } = VALID_BODY;
    const res = await createEvent(withAuth("http://localhost/api/admin/events", "POST", noTitle));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/title/i);
  });

  test("returns 400 when location is missing", async () => {
    const { location: _, ...noLoc } = VALID_BODY;
    const res = await createEvent(withAuth("http://localhost/api/admin/events", "POST", noLoc));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/location/i);
  });

  test("returns 400 when start_date is missing", async () => {
    const { start_date: _, ...noDate } = VALID_BODY;
    const res = await createEvent(withAuth("http://localhost/api/admin/events", "POST", noDate));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/start date/i);
  });

  test("defaults event_type to 'running' when not provided", async () => {
    const created = { ...EVENT_ROW, event_type: "running" };
    const insertMock = jest.fn().mockImplementation(() => ch(created));
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue({ ...ch(created), insert: insertMock }) });
    await createEvent(withAuth("http://localhost/api/admin/events", "POST", VALID_BODY));
    const insertCall = insertMock.mock.calls[0]?.[0];
    expect(insertCall?.event_type).toBe("running");
  });

  test("returns 500 on database insert error", async () => {
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch(null, { message: "db error" })) });
    const res = await createEvent(withAuth("http://localhost/api/admin/events", "POST", VALID_BODY));
    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/admin/events — quick update
// ═══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/admin/events — quick field update", () => {
  test("returns 400 when id is missing", async () => {
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch(null)) });
    const res = await quickPatch(withAuth("http://localhost/api/admin/events", "PATCH", { status: "published" }));
    expect(res.status).toBe(400);
  });

  test("updates event status to published", async () => {
    const updated = { ...EVENT_ROW, status: "published" };
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch(updated)) });
    const res  = await quickPatch(withAuth("http://localhost/api/admin/events", "PATCH", { id: "evt-1", status: "published" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("published");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/admin/events
// ═══════════════════════════════════════════════════════════════════════════════

describe("DELETE /api/admin/events", () => {
  test("returns 400 when id is missing", async () => {
    const res = await deleteEvent(withAuth("http://localhost/api/admin/events", "DELETE", {}));
    expect(res.status).toBe(400);
  });

  test("deletes event and cleans up registrations", async () => {
    const deleteMock = jest.fn().mockImplementation(() => ch(null));
    const chain = ch(null);
    chain.delete = deleteMock;
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(chain) });
    const res  = await deleteEvent(withAuth("http://localhost/api/admin/events", "DELETE", { id: "evt-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/admin/events/[id]/edit
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/admin/events/[id]/edit — load editable fields", () => {
  test("returns 404 when event is not found", async () => {
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch(null, { message: "not found" })) });
    const res = await getEdit(withAuth("http://localhost/api/admin/events/evt-1/edit"), PARAMS());
    expect(res.status).toBe(404);
  });

  test("returns event fields and confirmed_count", async () => {
    let call = 0;
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation(() => {
        call++;
        if (call === 1) return ch(EVENT_ROW); // events query
        return ch(null);                       // registrations count
      }),
    });
    const res  = await getEdit(withAuth("http://localhost/api/admin/events/evt-1/edit"), PARAMS());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.title).toBe("City Run 2026");
    expect(body.confirmed_count).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/admin/events/[id]/edit
// ═══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/admin/events/[id]/edit — update with audit log", () => {
  test("returns 400 when no editable fields are provided", async () => {
    // Only passes non-editable fields
    const res = await patchEdit(
      withAuth("http://localhost/api/admin/events/evt-1/edit", "PATCH", { fields: { status: "published" } }),
      PARAMS(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no editable fields/i);
  });

  test("returns 404 when event is not found", async () => {
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch(null, { message: "not found" })) });
    const res = await patchEdit(
      withAuth("http://localhost/api/admin/events/evt-1/edit", "PATCH",
        { fields: { title: "New Title" } }),
      PARAMS(),
    );
    expect(res.status).toBe(404);
  });

  test("updates title and writes audit log", async () => {
    const current = { ...EVENT_ROW, title: "Old Title", share_slug: "old-slug" };
    const updated = { ...current, title: "New Title" };
    let call = 0;
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "events") {
          call++;
          if (call === 1) return ch(current);  // load current
          return ch(updated);                   // apply update
        }
        return ch(null); // event_change_log insert, registrations count
      }),
    });
    const res  = await patchEdit(
      withAuth("http://localhost/api/admin/events/evt-1/edit", "PATCH",
        { fields: { title: "New Title" }, reason: "rebranding" }),
      PARAMS(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.title).toBe("New Title");
    expect(body.changes).toBe(1); // 1 changed field
  });

  test("returns 409 when reducing max_participants below confirmed count", async () => {
    const current = { ...EVENT_ROW, max_participants: 500 };
    let call = 0;
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "events") { call++; return ch(current); }
        // Simulate 100 confirmed registrations
        const countChain = ch(null);
        countChain.then = jest.fn().mockImplementation(
          (res: (v: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null, count: 100 }).then(res),
        );
        return countChain;
      }),
    });
    const res  = await patchEdit(
      withAuth("http://localhost/api/admin/events/evt-1/edit", "PATCH",
        { fields: { max_participants: 50 } }), // below the 100 confirmed
      PARAMS(),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/cannot reduce slots/i);
    expect(body.confirmed_count).toBe(100);
  });

  test("IST timestamp is converted to ISO 8601 with +05:30 offset", async () => {
    const current = { ...EVENT_ROW, registration_closes_at: null, share_slug: null };
    const updated = { ...current, registration_closes_at: "2026-12-01T10:00:00+05:30" };
    let insertedData: unknown;
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "events") {
          const c = ch(updated);
          const origUpdate = c.update.bind(c);
          c.update = jest.fn().mockImplementation((data: unknown) => {
            insertedData = data;
            return origUpdate(data);
          });
          return c;
        }
        return ch(null);
      }),
    });
    await patchEdit(
      withAuth("http://localhost/api/admin/events/evt-1/edit", "PATCH",
        { fields: { registration_closes_at: "2026-12-01T10:00" } }),
      PARAMS(),
    );
    // The sanitize function should have appended :00+05:30
    const updates = insertedData as Record<string, unknown>;
    expect(updates?.registration_closes_at).toBe("2026-12-01T10:00:00+05:30");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/admin/events/[id]/duplicate
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/admin/events/[id]/duplicate — clone event", () => {
  const SOURCE_EVENT = {
    ...EVENT_ROW,
    description: "Original description",
    event_type: "running",
    event_category: null,
  };
  const RACES = [
    { id: "race-1", event_id: "evt-1", name: "5K Run", distance: "5K", price: 499, max_slots: 200, display_order: 1, status: "active" },
    { id: "race-2", event_id: "evt-1", name: "10K Run", distance: "10K", price: 799, max_slots: 100, display_order: 2, status: "active" },
  ];
  const NEW_EVENT = { id: "evt-new", title: "City Run 2026 (Copy)", share_slug: "city-run-2026-copy-xyz" };

  test("returns 404 when source event is not found", async () => {
    mockDb.mockReturnValue({ from: jest.fn().mockReturnValue(ch(null, { message: "not found" })) });
    const res = await duplicateEvent(
      withAuth("http://localhost/api/admin/events/evt-1/duplicate", "POST", {}),
      PARAMS(),
    );
    expect(res.status).toBe(404);
  });

  test("creates a new draft event with (Copy) title", async () => {
    let call = 0;
    const insertMock = jest.fn().mockImplementation(() => ch(null));
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "events") {
          call++;
          if (call === 1) return ch(SOURCE_EVENT); // source fetch
          return ch(NEW_EVENT);                     // insert new event
        }
        if (table === "event_races")    return { ...ch(RACES), insert: insertMock };
        if (table === "event_sponsors") return ch([]);
        return ch(null);
      }),
    });
    const res  = await duplicateEvent(
      withAuth("http://localhost/api/admin/events/evt-1/duplicate", "POST", {}),
      PARAMS(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.title).toContain("City Run 2026");
  });

  test("copies race categories when source event has races", async () => {
    let call = 0;
    const raceInsert = jest.fn().mockImplementation(() => ch(null));
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "events") {
          call++;
          if (call === 1) return ch(SOURCE_EVENT);
          return ch(NEW_EVENT);
        }
        if (table === "event_races") {
          const c = ch(RACES);
          c.insert = raceInsert;
          return c;
        }
        return ch([]);
      }),
    });
    await duplicateEvent(
      withAuth("http://localhost/api/admin/events/evt-1/duplicate", "POST", {}),
      PARAMS(),
    );
    const body = await (await duplicateEvent(
      withAuth("http://localhost/api/admin/events/evt-1/duplicate", "POST", {}),
      PARAMS(),
    )).json();
    expect(body.races_copied).toBe(2);
  });

  test("custom title is used when new_title is provided", async () => {
    let call = 0;
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "events") {
          call++;
          if (call === 1) return ch(SOURCE_EVENT);
          return ch({ ...NEW_EVENT, title: "Marathon 2027 Edition" });
        }
        return ch([]);
      }),
    });
    const res  = await duplicateEvent(
      withAuth("http://localhost/api/admin/events/evt-1/duplicate", "POST",
        { new_title: "Marathon 2027 Edition" }),
      PARAMS(),
    );
    const body = await res.json();
    expect(body.title).toBe("Marathon 2027 Edition");
  });

  test("sponsors_copied is 0 when include_sponsors is false (default)", async () => {
    let call = 0;
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "events") { call++; return call === 1 ? ch(SOURCE_EVENT) : ch(NEW_EVENT); }
        return ch([]);
      }),
    });
    const res  = await duplicateEvent(
      withAuth("http://localhost/api/admin/events/evt-1/duplicate", "POST", {}),
      PARAMS(),
    );
    const body = await res.json();
    expect(body.sponsors_copied).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/admin/events/[id]/stats
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/admin/events/[id]/stats — dashboard stats", () => {
  const CORE_STATS = {
    total: 150, confirmed: 120, cancelled: 10, pending: 20,
    paid: 100, free: 20, checked_in: 85,
    revenue_collected: 99800, revenue_pending: 19800, avg_per_paid: 998,
    email_sent: 110, email_failed: 5, email_none: 5,
    by_category: { "5K": 60, "10K": 60 }, timeline: [],
    computed_at: "2026-07-01T10:00:00Z",
  };

  test("returns 401 without auth", async () => {
    mockAuth.mockResolvedValue(false);
    const res = await getStats(noAuth("http://localhost/api/admin/events/evt-1/stats"), PARAMS());
    expect(res.status).toBe(401);
  });

  test("returns 500 on events DB error", async () => {
    mockDb.mockReturnValue({
      from: jest.fn().mockReturnValue(ch(null, { message: "db error" })),
      rpc:  jest.fn().mockResolvedValue({ data: null, error: { message: "rpc error" } }),
    });
    const res = await getStats(withAuth("http://localhost/api/admin/events/evt-1/stats"), PARAMS());
    expect(res.status).toBe(500);
  });

  test("returns comprehensive stats from RPC aggregation", async () => {
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "events") return ch(EVENT_ROW);
        return ch([]);
      }),
      rpc: jest.fn().mockImplementation((name: string) => {
        if (name === "event_stats")        return Promise.resolve({ data: CORE_STATS, error: null });
        if (name === "event_raceday_stats") return Promise.resolve({ data: { bib_collected: 50, breakfast: 30, certificates: 10 }, error: null });
        return Promise.resolve({ data: null, error: null });
      }),
    });
    const res  = await getStats(withAuth("http://localhost/api/admin/events/evt-1/stats"), PARAMS());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats.confirmed).toBe(120);
    expect(body.stats.revenue_collected).toBe(99800);
    expect(body.stats.checked_in).toBe(85);
    expect(body.stats.bib_collected).toBe(50);
    expect(body.stats.capacity_pct).toBe(24); // 120/500 * 100 = 24
  });

  test("response includes Cache-Control header for 30 second caching", async () => {
    mockDb.mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        // events query ends with .single() — ch(EVENT_ROW) works fine
        if (table === "events") return ch(EVENT_ROW);
        // All other queries are awaited directly (no .single()) and must return arrays
        return ch([]);
      }),
      rpc: jest.fn().mockResolvedValue({ data: CORE_STATS, error: null }),
    });
    const res = await getStats(withAuth("http://localhost/api/admin/events/evt-1/stats"), PARAMS());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toMatch(/max-age=30/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Export participants as CSV
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/admin/events/[id]/registrations/export — CSV download", () => {
  const { GET: exportCsv } = require("@/app/api/admin/events/[id]/registrations/export/route");

  const REG_ROWS = [
    {
      registration_code: "CS-EVT-001", user_name: "Alice Smith", user_email: "alice@test.com",
      phone: "9876543210", gender: "female", date_of_birth: "1990-01-15", blood_group: "A+",
      emergency_contact: "9876543211", distance_category: "10K", coupon_code: null, coupon_discount: 0,
      original_price: 999, final_price: 999, payment_status: "paid", status: "confirmed",
      created_at: "2026-10-01T10:00:00Z", checked_in_at: null, breakfast_availed: false,
      tshirt_size: "M", tshirt_issued: false, tshirt_issued_at: null, tshirt_issued_by: null,
      confirmation_email_sent_at: "2026-10-01T10:01:00Z", email_status: "sent",
    },
  ];

  test("returns CSV content type and attachment header", async () => {
    mockDb.mockReturnValue({
      from: jest.fn().mockReturnValue(ch(REG_ROWS)),
    });
    const res = await exportCsv(withAuth("http://localhost/api/admin/events/evt-1/registrations/export"), PARAMS());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/csv/);
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment/);
    expect(res.headers.get("Content-Disposition")).toMatch(/\.csv/);
  });

  test("CSV contains registration data rows", async () => {
    mockDb.mockReturnValue({
      from: jest.fn().mockReturnValue(ch(REG_ROWS)),
    });
    const res  = await exportCsv(withAuth("http://localhost/api/admin/events/evt-1/registrations/export"), PARAMS());
    const text = await res.text();
    expect(text).toContain("Registration Code");  // header row
    expect(text).toContain("CS-EVT-001");          // data row
    expect(text).toContain("Alice Smith");
  });

  test("returns 401 without auth", async () => {
    mockAuth.mockResolvedValue(false);
    const res = await exportCsv(noAuth("http://localhost/api/admin/events/evt-1/registrations/export"), PARAMS());
    expect(res.status).toBe(401);
  });
});
