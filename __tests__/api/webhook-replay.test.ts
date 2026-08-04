/**
 * Regression tests for Razorpay webhook replay-attack protection (Issue 3).
 *
 * Verifies that:
 *  • Valid HMAC + timestamp within 5 min window → 200.
 *  • Valid HMAC + timestamp older than 5 min    → 400 (replay rejected).
 *  • Valid HMAC + future timestamp > 5 min      → 400 (replay rejected).
 *  • Valid HMAC + malformed timestamp           → 400.
 *  • Missing timestamp header                   → 200 (warning logged, not rejected).
 *  • Invalid HMAC                               → 400 regardless of timestamp.
 */

process.env.RAZORPAY_WEBHOOK_SECRET   = "test-webhook-secret";
process.env.COACH_TOKEN_SECRET        = "test-coach-secret";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server",   () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/job-queue",         () => ({ enqueueJob: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/job-handlers",      () => ({
  handleEventQrEmail:   jest.fn().mockResolvedValue(undefined),
  handleInvoiceGenerate: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/event-qr",          () => ({ signEventQR: jest.fn().mockReturnValue("qr") }));
jest.mock("@/lib/membership-activate", () => ({ activateMembership: jest.fn() }));
jest.mock("@/lib/it-run-email",      () => ({ sendItRunConfirmationEmail: jest.fn() }));

import crypto     from "crypto";
import { NextRequest }  from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { POST }   from "@/app/api/webhooks/razorpay/route";

const mockDb = getSupabaseServer as jest.Mock;

const SECRET = "test-webhook-secret";

// Minimal chainable DB mock — returns "not found" for registrations so the
// handler exits early after signature validation without real DB work.
function ch(data: unknown = null, error: unknown = null) {
  const self: Record<string, jest.Mock> = {};
  for (const m of ["select","eq","is","in","order","limit","update","neq"]) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  self.single      = jest.fn().mockResolvedValue({ data, error });
  self.maybeSingle = jest.fn().mockResolvedValue({ data, error });
  self.then        = jest.fn().mockImplementation((res: (v: unknown) => unknown) => Promise.resolve({ data, error }).then(res));
  return self;
}

function makeDb() {
  mockDb.mockReturnValue({
    from: jest.fn().mockReturnValue(ch(null)),
  });
}

const PAYLOAD = JSON.stringify({
  entity:     "event",
  account_id: "acc_test",
  event:      "payment.captured",
  payload:    { payment: { entity: { id: "pay_test", order_id: "order_test", amount: 50000, currency: "INR", status: "captured", method: "upi", captured: true, notes: {} } } },
});

function hmac(body: string): string {
  return crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

function makeReq(body: string, sig: string, timestampSec?: number | null | "bad"): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type":          "application/json",
    "x-razorpay-signature":  sig,
  };
  if (timestampSec !== undefined) {
    if (timestampSec === "bad") {
      headers["x-razorpay-timestamp"] = "not-a-number";
    } else if (timestampSec !== null) {
      headers["x-razorpay-timestamp"] = String(timestampSec);
    }
    // null → header omitted
  }
  return new NextRequest("http://localhost/api/webhooks/razorpay", {
    method: "POST",
    body,
    headers,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Razorpay Webhook Replay Protection", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    makeDb();
  });

  const NOW_SEC = Math.floor(Date.now() / 1000);

  it("accepts valid HMAC + current timestamp", async () => {
    const sig = hmac(PAYLOAD);
    const res = await POST(makeReq(PAYLOAD, sig, NOW_SEC));
    expect(res.status).toBe(200);
  });

  it("accepts valid HMAC + timestamp 4 min 59 sec in the past", async () => {
    const sig = hmac(PAYLOAD);
    const res = await POST(makeReq(PAYLOAD, sig, NOW_SEC - 299));
    expect(res.status).toBe(200);
  });

  it("rejects valid HMAC + timestamp older than 5 minutes", async () => {
    const sig = hmac(PAYLOAD);
    const res = await POST(makeReq(PAYLOAD, sig, NOW_SEC - 301));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/timestamp too old/i);
  });

  it("rejects valid HMAC + future timestamp more than 5 minutes ahead", async () => {
    const sig = hmac(PAYLOAD);
    const res = await POST(makeReq(PAYLOAD, sig, NOW_SEC + 400));
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toMatch(/timestamp too old/i);
  });

  it("rejects valid HMAC + malformed timestamp header", async () => {
    const sig = hmac(PAYLOAD);
    const res = await POST(makeReq(PAYLOAD, sig, "bad"));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid.*timestamp|timestamp.*invalid/i);
  });

  it("accepts valid HMAC + missing timestamp header (backward compatible)", async () => {
    const sig = hmac(PAYLOAD);
    const res = await POST(makeReq(PAYLOAD, sig, null)); // null → omit header
    expect(res.status).toBe(200);
  });

  it("rejects invalid HMAC regardless of timestamp", async () => {
    const res = await POST(makeReq(PAYLOAD, "deadbeef".repeat(8), NOW_SEC));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/signature/i);
  });
});
