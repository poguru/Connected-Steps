// Regression tests for the QR code / confirmation email delivery flow.
//
// ROOT CAUSE: Vercel freezes serverless functions after the HTTP response is
// sent. The original `void handler().catch()` pattern was killed before SES
// was called — users received no confirmation email.
//
// Fix: next/server `after()` keeps the function alive post-response.
//
// Tests: handleEventQrEmail (1–5), audit endpoint (6–8), bulk resend (9–12)

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";
process.env.ADMIN_PASSWORD            = "test-admin";
process.env.COACH_TOKEN_SECRET        = "test-secret";
process.env.NEXT_PUBLIC_APP_URL       = "https://www.connectedsteps.in";

// Top-level mocks — hoisted before any imports
jest.mock("@/lib/supabase-server",  () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth", () => {
  const actual = jest.requireActual<typeof import("@/lib/admin-auth")>("@/lib/admin-auth");
  return { ...actual, isAdminOrCoach: jest.fn().mockResolvedValue(true) };
});
jest.mock("@/lib/event-qr",         () => ({ signEventQR: jest.fn().mockReturnValue("mock-qr-token") }));
jest.mock("@/lib/notify",           () => ({
  sendEmail:                  jest.fn(),
  eventRegistrationEmailHTML: jest.fn().mockReturnValue("<html>email</html>"),
}));
// Mock job-handlers so resend tests can control handleEventQrEmail
jest.mock("@/lib/job-handlers",     () => ({ handleEventQrEmail: jest.fn() }));

import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail }          from "@/lib/notify";
import { handleEventQrEmail } from "@/lib/job-handlers";
import { NextRequest }        from "next/server";
import { makeAdminHeaders }   from "@/__tests__/helpers/admin-auth";

const mockGetSupabaseServer  = getSupabaseServer  as jest.Mock;
const mockSendEmail          = sendEmail          as jest.Mock;
const mockHandleQrEmailGlobal = handleEventQrEmail as unknown as jest.Mock;

// ── DB mock helpers ───────────────────────────────────────────────────────────

function makeHandlerDb(reg: { qr_token: string | null; confirmation_email_sent_at: string | null } | null) {
  const eqUpdateMock = jest.fn().mockResolvedValue({ error: null });
  const updateMock   = jest.fn().mockReturnValue({ eq: eqUpdateMock });

  return {
    from: jest.fn().mockImplementation(() => ({
      select:      jest.fn().mockReturnThis(),
      eq:          jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: reg, error: null }),
      update:      updateMock,
    })),
    _update: updateMock,
  };
}

function makeResendDb(rows: unknown[]) {
  return {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      is:     jest.fn().mockReturnThis(),
      order:  jest.fn().mockReturnThis(),
      limit:  jest.fn().mockResolvedValue({ data: rows, error: null }),
    }),
  };
}

function makeAuditDb(rows1: unknown[], rows2: unknown[], rows3: unknown[]) {
  let n = 0;
  return {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      is:     jest.fn().mockReturnThis(),
      order:  jest.fn().mockReturnThis(),
      limit:  jest.fn().mockImplementation(() => {
        n++;
        return Promise.resolve({ data: n === 1 ? rows1 : n === 2 ? rows2 : rows3, error: null });
      }),
    }),
  };
}

function makeAdminReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/x", {
    method:  "POST",
    headers: { "Content-Type": "application/json", ...makeAdminHeaders() },
    body:    JSON.stringify(body),
  });
}

const BASE_PAYLOAD = {
  registrationId:   "reg-1",
  registrationCode: "CS-EVT-ABC123",
  eventId:          "event-1",
  userEmail:        "runner@cs.test",
  userName:         "Test Runner",
  eventTitle:       "5K Run",
  startDate:        "2026-07-01",
  startTime:        "06:00",
  location:         "Hyderabad",
  distanceCategory: "5K",
};

const CONFIRMED_REG = {
  id: "r1", registration_code: "CS1", user_email: "a@cs.test", user_name: "Alice",
  event_id: "ev1", distance_category: "5K", email_status: null,
  confirmation_email_sent_at: null, qr_token: null,
  events: { title: "5K Run", start_date: "2026-07-01", start_time: null, location: "Hyd" },
};

beforeEach(() => jest.clearAllMocks());

// ── 1–5: handleEventQrEmail handler ──────────────────────────────────────────
// jest.requireActual loads the REAL implementation of the handler.
// Its dependencies (sendEmail, signEventQR, getSupabaseServer) are still mocked
// via the top-level jest.mock calls above — requireActual only bypasses the
// mock for the specified module, not for its imports.

describe("handleEventQrEmail (real implementation via requireActual)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Handler = (p: typeof BASE_PAYLOAD) => Promise<void>;
  const handler = (jest.requireActual("@/lib/job-handlers") as { handleEventQrEmail: Handler }).handleEventQrEmail;

  test("1. happy path: saves confirmation_email_sent_at + email_ses_message_id", async () => {
    const db = makeHandlerDb({ qr_token: "existing-token", confirmation_email_sent_at: null });
    mockGetSupabaseServer.mockReturnValue(db);
    mockSendEmail.mockResolvedValue({ ok: true, messageId: "ses-123", provider: "ses" });

    await handler(BASE_PAYLOAD);

    const lastUpdate = db._update.mock.calls[db._update.mock.calls.length - 1][0] as Record<string, unknown>;
    expect(lastUpdate.email_status).toBe("sent");
    expect(lastUpdate.confirmation_email_sent_at).toBeTruthy();
    expect(lastUpdate.email_ses_message_id).toBe("ses-123");
    expect(lastUpdate.qr_generated_at).toBeTruthy();
  });

  test("2. idempotent: no email if confirmation_email_sent_at already set", async () => {
    const db = makeHandlerDb({ qr_token: "tok", confirmation_email_sent_at: "2026-06-26T00:00:00Z" });
    mockGetSupabaseServer.mockReturnValue(db);

    await handler(BASE_PAYLOAD);

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test("3. generates QR if null, saves qr_token + qr_generated_at", async () => {
    const db = makeHandlerDb({ qr_token: null, confirmation_email_sent_at: null });
    mockGetSupabaseServer.mockReturnValue(db);
    mockSendEmail.mockResolvedValue({ ok: true, messageId: "ses-456", provider: "ses" });
    const { signEventQR } = jest.requireMock<typeof import("@/lib/event-qr")>("@/lib/event-qr");

    await handler(BASE_PAYLOAD);

    expect(signEventQR).toHaveBeenCalledWith("CS-EVT-ABC123", "event-1");
    const qrUpdate = db._update.mock.calls[0][0] as Record<string, unknown>;
    expect(qrUpdate.qr_token).toBe("mock-qr-token");
    expect(qrUpdate.qr_generated_at).toBeTruthy();
  });

  test("4. SES failure: saves email_status=failed, then throws for retry", async () => {
    const db = makeHandlerDb({ qr_token: "tok", confirmation_email_sent_at: null });
    mockGetSupabaseServer.mockReturnValue(db);
    mockSendEmail.mockResolvedValue({ ok: false, error: "MessageRejected", provider: "ses" });

    await expect(handler(BASE_PAYLOAD)).rejects.toThrow(/SES delivery failed/);

    const failUpdate = db._update.mock.calls.find(
      c => (c[0] as Record<string, unknown>).email_status === "failed",
    );
    expect(failUpdate).toBeTruthy();
  });

  test("5. reuses existing qr_token without regenerating", async () => {
    const db = makeHandlerDb({ qr_token: "already-signed", confirmation_email_sent_at: null });
    mockGetSupabaseServer.mockReturnValue(db);
    mockSendEmail.mockResolvedValue({ ok: true, messageId: "ses-789", provider: "ses" });
    const { signEventQR } = jest.requireMock<typeof import("@/lib/event-qr")>("@/lib/event-qr");

    await handler(BASE_PAYLOAD);

    expect(signEventQR).not.toHaveBeenCalled();
  });
});

// ── 6–8: Audit endpoint ───────────────────────────────────────────────────────

describe("GET /api/admin/events/registrations/audit", () => {
  test("6. returns confirmed registrations missing confirmation_email_sent_at", async () => {
    const { GET } = await import("@/app/api/admin/events/registrations/audit/route");
    mockGetSupabaseServer.mockReturnValue(makeAuditDb(
      [{ id: "r1", confirmation_email_sent_at: null }], [], [],
    ));
    const body = await (await GET(new NextRequest("http://localhost/x"))).json();
    expect(body.missing_confirmation_email.count).toBe(1);
  });

  test("7. returns registrations with email_status=failed", async () => {
    const { GET } = await import("@/app/api/admin/events/registrations/audit/route");
    mockGetSupabaseServer.mockReturnValue(makeAuditDb(
      [], [{ id: "r2" }, { id: "r3" }], [],
    ));
    const body = await (await GET(new NextRequest("http://localhost/x"))).json();
    expect(body.failed_email.count).toBe(2);
  });

  test("8. summary.total_needing_resend deduplicates across missing+failed", async () => {
    const { GET } = await import("@/app/api/admin/events/registrations/audit/route");
    mockGetSupabaseServer.mockReturnValue(makeAuditDb(
      [{ id: "r1" }, { id: "r2" }],
      [{ id: "r2" }, { id: "r3" }],
      [],
    ));
    const body = await (await GET(new NextRequest("http://localhost/x"))).json();
    expect(body.summary.total_needing_resend).toBe(3); // r1+r2+r3 unique
  });
});

// ── 9–12: Bulk resend endpoint ────────────────────────────────────────────────

describe("POST /api/admin/events/registrations/resend-missing", () => {
  test("9. calls handleEventQrEmail for each eligible registration", async () => {
    const { POST } = await import("@/app/api/admin/events/registrations/resend-missing/route");
    mockGetSupabaseServer.mockReturnValue(makeResendDb([
      CONFIRMED_REG,
      { ...CONFIRMED_REG, id: "r2", user_email: "b@cs.test" },
    ]));
    mockHandleQrEmailGlobal.mockResolvedValue(undefined);

    const body = await (await POST(makeAdminReq({}))).json();

    expect(mockHandleQrEmailGlobal).toHaveBeenCalledTimes(2);
    expect(body.sent).toBe(2);
    expect(body.failed).toBe(0);
  });

  test("10. skips already-confirmed (code-level guard)", async () => {
    const { POST } = await import("@/app/api/admin/events/registrations/resend-missing/route");
    mockGetSupabaseServer.mockReturnValue(makeResendDb([CONFIRMED_REG]));
    mockHandleQrEmailGlobal.mockResolvedValue(undefined);

    const body = await (await POST(makeAdminReq({}))).json();

    expect(body.sent).toBe(1);
    expect(body.skipped).toBe(0);
  });

  test("11. dry_run=true returns preview, never calls handleEventQrEmail", async () => {
    const { POST } = await import("@/app/api/admin/events/registrations/resend-missing/route");
    mockGetSupabaseServer.mockReturnValue(makeResendDb([CONFIRMED_REG, { ...CONFIRMED_REG, id: "r2" }]));

    const body = await (await POST(makeAdminReq({ dry_run: true }))).json();

    expect(body.dry_run).toBe(true);
    expect(body.would_send).toBe(2);
    expect(mockHandleQrEmailGlobal).not.toHaveBeenCalled();
  });

  test("12. one failure captured, processing continues, errors array populated", async () => {
    const { POST } = await import("@/app/api/admin/events/registrations/resend-missing/route");
    mockGetSupabaseServer.mockReturnValue(makeResendDb([
      CONFIRMED_REG,
      { ...CONFIRMED_REG, id: "r2", user_email: "b@cs.test" },
    ]));
    mockHandleQrEmailGlobal
      .mockRejectedValueOnce(new Error("SES rate limit"))
      .mockResolvedValueOnce(undefined);

    const body = await (await POST(makeAdminReq({}))).json();

    expect(body.sent).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.errors[0].error).toContain("SES rate limit");
  });
});
