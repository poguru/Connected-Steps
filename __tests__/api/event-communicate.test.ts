/**
 * Tests for /api/admin/events/[id]/communicate
 *
 * Covers:
 *  GET  — auth check, returns communication history
 *  POST — auth check, validation, successful batch creation, no-recipient case
 */

process.env.ADMIN_PASSWORD            = "test-admin";
process.env.COACH_TOKEN_SECRET        = "test-secret";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("sanitize-html", () => (html: string) => html);
jest.mock("@/lib/process-email-batch", () => ({ processEmailBatch: jest.fn() }));
jest.mock("next/server", () => {
  const actual = jest.requireActual<typeof import("next/server")>("next/server");
  return { ...actual, after: jest.fn((fn: () => unknown) => { Promise.resolve(fn()).catch(() => {}); }) };
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
import { GET, POST } from "@/app/api/admin/events/[id]/communicate/route";

// ── Chainable mock helper ─────────────────────────────────────────────────────

function ch(data: unknown, error: unknown = null) {
  const result = { data, error };
  const self: Record<string, jest.Mock> = {};
  for (const m of ["select","eq","neq","not","is","order","limit","single","insert","update","delete"]) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  self.single      = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  self.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  self.then        = jest.fn().mockImplementation(
    (res: (v: unknown) => unknown) => Promise.resolve(result).then(res),
  );
  return self;
}

const PARAMS = Promise.resolve({ id: "evt-test-001" });

function makeDb() {
  const db: { from: jest.Mock } = {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "event_comm_history") return ch([{ id: "h1", sent_at: "2026-01-01", subject: "Test", recipients: 10, sent: 10, failed: 0, status: "sent", channel: "email" }]);
      if (table === "event_registrations") return ch([{ user_email: "runner@example.com", user_name: "Test Runner", payment_status: "paid", status: "confirmed", checked_in_at: null }]);
      if (table === "events")              return ch({ title: "Test Run", start_date: "2026-12-01", start_time: "06:00", location: "Hyderabad" });
      if (table === "email_queue")         return ch(null);
      return ch(null);
    }),
  };
  mockDb.mockReturnValue(db);
  return db;
}

function makeReq(method: "GET" | "POST", body?: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/admin/events/evt-test-001/communicate`, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
}

// ── GET tests ─────────────────────────────────────────────────────────────────

describe("GET /api/admin/events/[id]/communicate", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when not admin", async () => {
    mockIsAdmin.mockResolvedValueOnce(false);
    const res = await GET(makeReq("GET"), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns communication history", async () => {
    makeDb();
    const res = await GET(makeReq("GET"), { params: PARAMS });
    expect(res.status).toBe(200);
    const body = await res.json() as { history: unknown[] };
    expect(Array.isArray(body.history)).toBe(true);
    expect(body.history.length).toBeGreaterThan(0);
  });
});

// ── POST tests ────────────────────────────────────────────────────────────────

describe("POST /api/admin/events/[id]/communicate", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when not admin", async () => {
    mockIsAdmin.mockResolvedValueOnce(false);
    const res = await POST(makeReq("POST", { subject: "Hi", body: "Hello" }), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 400 when subject is missing", async () => {
    makeDb();
    const res = await POST(makeReq("POST", { body: "Hello", recipient_filter: "all" }), { params: PARAMS });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(/subject/i);
  });

  it("returns 400 when body is missing", async () => {
    makeDb();
    const res = await POST(makeReq("POST", { subject: "Hello", recipient_filter: "all" }), { params: PARAMS });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(/body/i);
  });

  it("returns queued=0 when no recipients match filter", async () => {
    const db: { from: jest.Mock } = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "event_registrations") return ch([]);
        if (table === "events")              return ch({ title: "Test Run", start_date: "2026-12-01", start_time: "06:00", location: "Hyderabad" });
        return ch(null);
      }),
    };
    mockDb.mockReturnValue(db);
    const res = await POST(makeReq("POST", { subject: "Hello", body: "World", recipient_filter: "all" }), { params: PARAMS });
    expect(res.status).toBe(200);
    const json = await res.json() as { queued: number; batch_id: null };
    expect(json.queued).toBe(0);
    expect(json.batch_id).toBeNull();
  });

  it("creates a batch and returns batch_id when recipients exist", async () => {
    makeDb();
    const res = await POST(makeReq("POST", { subject: "Hello", body: "World", recipient_filter: "all" }), { params: PARAMS });
    expect(res.status).toBe(200);
    const json = await res.json() as { queued: number; batch_id: string };
    expect(typeof json.batch_id).toBe("string");
    expect(json.queued).toBeGreaterThan(0);
  });

  it("accepts HTML body (body_html field)", async () => {
    makeDb();
    const res = await POST(makeReq("POST", { subject: "Hello", body_html: "<p>World</p>", recipient_filter: "paid" }), { params: PARAMS });
    expect(res.status).toBe(200);
    const json = await res.json() as { batch_id: string };
    expect(typeof json.batch_id).toBe("string");
  });

  it("returns 400 when total attachment size exceeds 10 MB", async () => {
    makeDb();
    const bigAttachment = [{ size: 11 * 1024 * 1024, name: "big.pdf", url: "https://example.com/big.pdf" }];
    const res = await POST(makeReq("POST", { subject: "Hi", body: "Hi", recipient_filter: "all", attachments: bigAttachment }), { params: PARAMS });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(/10 MB/i);
  });
});
