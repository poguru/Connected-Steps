/**
 * Tests for /api/admin/events/[id]/waitlist
 *
 * Covers:
 *  GET    — auth check, returns waitlist with counts
 *  PATCH  — auth check, validation, approve (sends email), reject
 *  DELETE — auth check, removes entry
 */

process.env.ADMIN_PASSWORD            = "test-admin";
process.env.COACH_TOKEN_SECRET        = "test-secret";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/email-service", () => ({ sendSingleEmail: jest.fn().mockResolvedValue({ ok: true }) }));
jest.mock("next/server", () => {
  const actual = jest.requireActual<typeof import("next/server")>("next/server");
  return { ...actual, after: jest.fn((fn: () => Promise<void>) => { fn().catch(() => {}); }) };
});

const mockIsAdmin = jest.fn().mockResolvedValue(true);
jest.mock("@/lib/admin-auth", () => ({
  isAdminOrCoach: (...args: unknown[]) => mockIsAdmin(...args),
}));

const mockDb = jest.fn();
jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => mockDb(),
}));

import { NextRequest } from "next/server";
import { GET, PATCH, DELETE } from "@/app/api/admin/events/[id]/waitlist/route";

// ── Chain builder ─────────────────────────────────────────────────────────────

function ch(data: unknown, error: unknown = null) {
  const result = { data, error };
  const self: Record<string, jest.Mock> = {};
  for (const m of ["select","eq","order","update","delete","single","maybeSingle"]) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  self.single      = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  self.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  self.then        = jest.fn().mockImplementation(
    (res: (v: unknown) => unknown) => Promise.resolve(result).then(res),
  );
  return self;
}

const WAITLIST_ENTRIES = [
  { id: "wl-1", user_email: "alice@example.com", user_name: "Alice", status: "waiting",  position: 1 },
  { id: "wl-2", user_email: "bob@example.com",   user_name: "Bob",   status: "approved", position: 2 },
];

const WL_ENTRY = {
  id: "wl-1", user_email: "alice@example.com", user_name: "Alice", status: "waiting",
  events: { title: "Test Run", start_date: "2026-12-01", location: "Hyderabad", share_slug: "test-run" },
};

const PARAMS = Promise.resolve({ id: "evt-test-001" });

function makeDb(waitlistEntry: unknown = WL_ENTRY) {
  const db: { from: jest.Mock } = {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "event_waitlist") {
        const c = ch(WAITLIST_ENTRIES);
        c.single = jest.fn().mockResolvedValue({ data: waitlistEntry, error: null });
        return c;
      }
      return ch(null);
    }),
  };
  mockDb.mockReturnValue(db);
  return db;
}

function makeReq(method: "GET" | "PATCH" | "DELETE", body?: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/admin/events/evt-test-001/waitlist`, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
}

// ── GET tests ─────────────────────────────────────────────────────────────────

describe("GET /api/admin/events/[id]/waitlist", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when not admin", async () => {
    mockIsAdmin.mockResolvedValueOnce(false);
    const res = await GET(makeReq("GET"), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns waitlist with waiting and approved counts", async () => {
    makeDb();
    const res = await GET(makeReq("GET"), { params: PARAMS });
    expect(res.status).toBe(200);
    const json = await res.json() as { waitlist: unknown[]; waiting: number; approved: number };
    expect(Array.isArray(json.waitlist)).toBe(true);
    expect(json.waiting).toBe(1);
    expect(json.approved).toBe(1);
  });
});

// ── PATCH tests ───────────────────────────────────────────────────────────────

describe("PATCH /api/admin/events/[id]/waitlist", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when not admin", async () => {
    mockIsAdmin.mockResolvedValueOnce(false);
    const res = await PATCH(makeReq("PATCH", { waitlist_id: "wl-1", action: "approve" }), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 400 when waitlist_id is missing", async () => {
    makeDb();
    const res = await PATCH(makeReq("PATCH", { action: "approve" }), { params: PARAMS });
    expect(res.status).toBe(400);
  });

  it("returns 400 when action is invalid", async () => {
    makeDb();
    const res = await PATCH(makeReq("PATCH", { waitlist_id: "wl-1", action: "invalid" }), { params: PARAMS });
    expect(res.status).toBe(400);
  });

  it("returns 404 when entry not found", async () => {
    makeDb(null);
    const res = await PATCH(makeReq("PATCH", { waitlist_id: "wl-999", action: "approve" }), { params: PARAMS });
    expect(res.status).toBe(404);
  });

  it("approves entry and returns status=approved", async () => {
    makeDb();
    const res = await PATCH(makeReq("PATCH", { waitlist_id: "wl-1", action: "approve" }), { params: PARAMS });
    expect(res.status).toBe(200);
    const json = await res.json() as { success: boolean; status: string };
    expect(json.success).toBe(true);
    expect(json.status).toBe("approved");
  });

  it("rejects entry and returns status=rejected", async () => {
    makeDb();
    const res = await PATCH(makeReq("PATCH", { waitlist_id: "wl-1", action: "reject" }), { params: PARAMS });
    expect(res.status).toBe(200);
    const json = await res.json() as { success: boolean; status: string };
    expect(json.success).toBe(true);
    expect(json.status).toBe("rejected");
  });

  it("sends approval email when action is approve", async () => {
    const { sendSingleEmail } = jest.requireMock("@/lib/email-service") as { sendSingleEmail: jest.Mock };
    makeDb();
    await PATCH(makeReq("PATCH", { waitlist_id: "wl-1", action: "approve" }), { params: PARAMS });
    expect(sendSingleEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "alice@example.com" })
    );
  });

  it("does NOT send email when action is reject", async () => {
    const { sendSingleEmail } = jest.requireMock("@/lib/email-service") as { sendSingleEmail: jest.Mock };
    makeDb();
    await PATCH(makeReq("PATCH", { waitlist_id: "wl-1", action: "reject" }), { params: PARAMS });
    expect(sendSingleEmail).not.toHaveBeenCalled();
  });
});

// ── DELETE tests ──────────────────────────────────────────────────────────────

describe("DELETE /api/admin/events/[id]/waitlist", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when not admin", async () => {
    mockIsAdmin.mockResolvedValueOnce(false);
    const res = await DELETE(makeReq("DELETE", { waitlist_id: "wl-1" }), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 200 on successful delete", async () => {
    makeDb();
    const res = await DELETE(makeReq("DELETE", { waitlist_id: "wl-1" }), { params: PARAMS });
    expect(res.status).toBe(200);
    const json = await res.json() as { success: boolean };
    expect(json.success).toBe(true);
  });
});
