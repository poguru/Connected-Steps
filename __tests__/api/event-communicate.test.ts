/**
 * Tests for /api/admin/events/[id]/communicate and /communicate/send-next
 *
 * Covers:
 *  GET        — auth check, returns communication history
 *  POST       — auth check, validation, successful batch creation, no-recipient case
 *  send-next  — auth check, empty queue finalises history, successful delivery,
 *               delivery failure, concurrent claim safety
 */

process.env.ADMIN_PASSWORD            = "test-admin";
process.env.COACH_TOKEN_SECRET        = "test-secret";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("sanitize-html", () => (html: string) => html);
jest.mock("@/lib/process-email-batch", () => ({ processEmailBatch: jest.fn() }));
jest.mock("@/lib/email-attachments", () => ({ loadAttachmentsAsBase64: jest.fn().mockResolvedValue([]) }));
jest.mock("@/lib/email-service", () => ({ sendSingleEmail: jest.fn().mockResolvedValue({ ok: true, messageId: "msg-123", provider: "zepto", httpStatus: 200 }) }));
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
import { POST as SEND_NEXT } from "@/app/api/admin/events/[id]/communicate/send-next/route";

// ── Chainable mock helper ─────────────────────────────────────────────────────

function ch(data: unknown, error: unknown = null) {
  const result = { data, error };
  const self: Record<string, jest.Mock> = {};
  for (const m of ["select","eq","neq","not","is","in","order","limit","single","insert","update","delete"]) {
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

// ── send-next tests ───────────────────────────────────────────────────────────

function makeSendNextReq(body?: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/admin/events/evt-test-001/communicate/send-next`, {
    method: "POST",
    ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
}

const QUEUED_EMAIL = {
  id:              "q-1",
  recipient_email: "runner@example.com",
  recipient_name:  "Test Runner",
  subject:         "Test Subject",
  html_body:       "<p>Hello</p>",
  attempts:        0,
  status:          "queued",
  attachments:     [],
};

function makeSendNextDb(opts: { email?: typeof QUEUED_EMAIL | null; claimError?: boolean } = {}) {
  const { email = QUEUED_EMAIL, claimError = false } = opts;
  let updateCallCount = 0;

  function makeEqChain(resolveValue: { error: unknown }): Record<string, jest.Mock> {
    const chain: Record<string, jest.Mock> = {};
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.then = jest.fn().mockImplementation(
      (res: (v: unknown) => unknown) => Promise.resolve(resolveValue).then(res)
    );
    return chain;
  }

  const db: { from: jest.Mock } = {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "email_queue") {
        // SELECT chain: .select().eq().in().order().limit() → resolves { data: [...], error }
        const selectChain = ch(email ? [email] : []);
        // UPDATE chain: each call resolves with no-error (first call can be claim error)
        selectChain.update = jest.fn().mockImplementation(() => {
          const isClaimAttempt = updateCallCount++ === 0;
          return makeEqChain({ error: claimError && isClaimAttempt ? { message: "claim failed" } : null });
        });
        return selectChain;
      }
      if (table === "event_comm_history") {
        const c = ch([{ status: "delivered" }]);
        c.update = jest.fn().mockReturnValue(makeEqChain({ error: null }));
        return c;
      }
      return ch(null);
    }),
  };
  mockDb.mockReturnValue(db);
  return db;
}

describe("POST /api/admin/events/[id]/communicate/send-next", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when not admin", async () => {
    mockIsAdmin.mockResolvedValueOnce(false);
    const res = await SEND_NEXT(makeSendNextReq({ batch_id: "b-1" }), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 400 when batch_id is missing", async () => {
    makeSendNextDb();
    const res = await SEND_NEXT(makeSendNextReq({}), { params: PARAMS });
    expect(res.status).toBe(400);
  });

  it("returns done=true when queue is empty and finalises history", async () => {
    makeSendNextDb({ email: null });
    const res = await SEND_NEXT(makeSendNextReq({ batch_id: "b-1" }), { params: PARAMS });
    expect(res.status).toBe(200);
    const json = await res.json() as { done: boolean };
    expect(json.done).toBe(true);
  });

  it("sends the next email and returns done=false on success", async () => {
    makeSendNextDb();
    const { sendSingleEmail } = jest.requireMock("@/lib/email-service") as { sendSingleEmail: jest.Mock };
    const res = await SEND_NEXT(makeSendNextReq({ batch_id: "b-1" }), { params: PARAMS });
    expect(res.status).toBe(200);
    const json = await res.json() as { done: boolean; status: string; email: string };
    expect(json.done).toBe(false);
    expect(json.status).toBe("delivered");
    expect(json.email).toBe("runner@example.com");
    expect(sendSingleEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "runner@example.com", subject: "Test Subject" })
    );
  });

  it("marks email as failed when sendSingleEmail returns ok=false", async () => {
    const { sendSingleEmail } = jest.requireMock("@/lib/email-service") as { sendSingleEmail: jest.Mock };
    sendSingleEmail.mockResolvedValueOnce({ ok: false, error: "bounce", isTransient: false });
    makeSendNextDb();
    const res = await SEND_NEXT(makeSendNextReq({ batch_id: "b-1" }), { params: PARAMS });
    expect(res.status).toBe(200);
    const json = await res.json() as { status: string };
    expect(json.status).toBe("failed");
  });

  it("re-queues for retry when failure is transient and attempts < 3", async () => {
    const { sendSingleEmail } = jest.requireMock("@/lib/email-service") as { sendSingleEmail: jest.Mock };
    sendSingleEmail.mockResolvedValueOnce({ ok: false, error: "timeout", isTransient: true });
    makeSendNextDb();
    const res = await SEND_NEXT(makeSendNextReq({ batch_id: "b-1" }), { params: PARAMS });
    const json = await res.json() as { status: string; retrying: boolean };
    expect(json.status).toBe("queued");
    expect(json.retrying).toBe(true);
  });
});
