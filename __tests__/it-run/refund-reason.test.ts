/**
 * The refund reason is mandatory everywhere it is entered: the participant panel, the downgrade request,
 * and the refund-request API. The API checks the same rule and stores the trimmed value; a rejected reason
 * never reaches the database.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth", () => ({ verifyUserToken: jest.fn(), USER_SESSION_COOKIE: "cs_user_session" }));

import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { checkRefundReason, REFUND_REASON_MESSAGES, REFUND_REASON_MAX } from "@/lib/it-run-refund-reason";
import { POST } from "@/app/api/it-run/refund-requests/route";

const mockDb = getSupabaseServer as jest.Mock;
const mockVerify = verifyUserToken as jest.Mock;

const OWNER = "asha@example.com";

// ── The rule ──────────────────────────────────────────────────────────────────

describe("checkRefundReason", () => {
  it("rejects an empty reason as required", () => {
    expect(checkRefundReason("")).toEqual({ ok: false, message: REFUND_REASON_MESSAGES.required });
  });

  it("rejects a missing, null or non-string reason as required", () => {
    for (const v of [undefined, null, 12345, ["a reason that is long"], { reason: "x" }]) {
      expect(checkRefundReason(v)).toEqual({ ok: false, message: REFUND_REASON_MESSAGES.required });
    }
  });

  it("rejects a whitespace-only reason as not valid", () => {
    expect(checkRefundReason("          ")).toEqual({ ok: false, message: REFUND_REASON_MESSAGES.blank });
    expect(checkRefundReason("\n\t  \r\n")).toEqual({ ok: false, message: REFUND_REASON_MESSAGES.blank });
  });

  it("rejects a reason shorter than 10 characters", () => {
    expect(checkRefundReason("too short")).toEqual({ ok: false, message: REFUND_REASON_MESSAGES.tooShort });
    expect(checkRefundReason("123456789")).toEqual({ ok: false, message: REFUND_REASON_MESSAGES.tooShort });
  });

  it("accepts exactly 10 valid characters", () => {
    expect(checkRefundReason("0123456789")).toEqual({ ok: true, value: "0123456789" });
  });

  it("trims leading and trailing whitespace before counting, and returns the trimmed value", () => {
    expect(checkRefundReason("   I cannot attend.   ")).toEqual({ ok: true, value: "I cannot attend." });
    expect(checkRefundReason("   123456789   ")).toEqual({ ok: false, message: REFUND_REASON_MESSAGES.tooShort });
    expect(checkRefundReason("  0123456789  ")).toEqual({ ok: true, value: "0123456789" });
  });

  it("counts characters the way the database does, so an emoji is one character", () => {
    // 9 emoji: 18 UTF-16 units but 9 characters, so still too short
    expect(checkRefundReason("😀".repeat(9))).toEqual({ ok: false, message: REFUND_REASON_MESSAGES.tooShort });
    expect(checkRefundReason("😀".repeat(10))).toEqual({ ok: true, value: "😀".repeat(10) });
  });

  it("accepts up to 1000 characters and rejects more", () => {
    expect(checkRefundReason("a".repeat(REFUND_REASON_MAX)).ok).toBe(true);
    expect(checkRefundReason("a".repeat(REFUND_REASON_MAX + 1))).toEqual({ ok: false, message: REFUND_REASON_MESSAGES.tooLong });
  });
});

// ── API ───────────────────────────────────────────────────────────────────────

/** Fake for the refund-request POST: a registration owned by OWNER, and a recording insert. */
function fakeDb(opts: { insert?: { data?: any; error?: any } } = {}) {
  const inserts: any[] = [];
  return {
    inserts,
    from(table: string) {
      const b: any = {};
      let op = "select";
      for (const m of ["select", "eq"]) b[m] = () => b;
      b.insert = (payload: unknown) => { op = "insert"; inserts.push({ table, payload }); return b; };
      b.maybeSingle = () => {
        if (op === "insert") {
          const ins = opts.insert ?? { data: { id: "rq-1", status: "requested", created_at: "2026-10-11T00:00:00Z" }, error: null };
          return Promise.resolve(ins);
        }
        return Promise.resolve({
          data: { id: "reg-1", event_id: "ev-1", registration_code: "ITR-AAA", payment_status: "paid", registration_status: "active", final_price: 799 },
          error: null,
        });
      };
      return b;
    },
  };
}

function req(body: unknown, token = "tok") {
  return new NextRequest("http://t/api/it-run/refund-requests", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `cs_user_session=${token}` },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockReturnValue(OWNER);
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("POST /api/it-run/refund-requests reason validation", () => {
  it.each([
    ["an empty reason", { registration_code: "ITR-AAA", reason: "" }, REFUND_REASON_MESSAGES.required],
    ["a missing reason", { registration_code: "ITR-AAA" }, REFUND_REASON_MESSAGES.required],
    ["a null reason", { registration_code: "ITR-AAA", reason: null }, REFUND_REASON_MESSAGES.required],
    ["a numeric reason", { registration_code: "ITR-AAA", reason: 1234567890123 }, REFUND_REASON_MESSAGES.required],
    ["a whitespace-only reason", { registration_code: "ITR-AAA", reason: "         " }, REFUND_REASON_MESSAGES.blank],
    ["a reason shorter than 10 characters", { registration_code: "ITR-AAA", reason: "too short" }, REFUND_REASON_MESSAGES.tooShort],
  ])("refuses %s with a 400 and creates nothing", async (_label, body, message) => {
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await POST(req(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(message);
    expect(db.inserts).toEqual([]);
  });

  it("refuses a request body that is not JSON, and creates nothing", async () => {
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await POST(req("not json {"));
    expect(res.status).toBe(400);
    expect(db.inserts).toEqual([]);
  });

  it("accepts exactly 10 valid characters and stores the trimmed reason", async () => {
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await POST(req({ registration_code: "ITR-AAA", reason: "  0123456789  " }));
    expect(res.status).toBe(201);
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0].payload.request_reason).toBe("0123456789");
  });

  it("stores a longer reason with its surrounding whitespace removed", async () => {
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    await POST(req({ registration_code: "ITR-AAA", reason: "   I cannot attend because of travel.   " }));
    expect(db.inserts[0].payload.request_reason).toBe("I cannot attend because of travel.");
  });

  it("refuses an unsigned request before any validation or database access", async () => {
    mockVerify.mockReturnValue(null);
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await POST(req({ registration_code: "ITR-AAA", reason: "I cannot attend this year" }, "bad"));
    expect(res.status).toBe(401);
    expect(db.inserts).toEqual([]);
  });

  it("a duplicate open request is refused with 409 and no second record is created", async () => {
    const db = fakeDb({ insert: { data: null, error: { code: "23505", message: "duplicate" } } });
    mockDb.mockReturnValue(db);
    const res = await POST(req({ registration_code: "ITR-AAA", reason: "I cannot attend this year" }));
    expect(res.status).toBe(409);
    expect(db.inserts).toHaveLength(1);
  });
});

// ── Admin sees the reason and decisions keep it ───────────────────────────────

describe("admin refund requests keep the reason", () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", "..", p), "utf8");

  it("the admin queue list returns the reason", () => {
    expect(read("app/api/it-run/admin/refund-requests/route.ts")).toMatch(/request_reason/);
  });

  it("the admin detail returns the reason", () => {
    expect(read("app/api/it-run/admin/refund-requests/[id]/route.ts")).toMatch(/request_reason/);
  });

  it("the admin queue page shows the reason", () => {
    expect(read("app/it-run/admin/refund-requests/page.tsx")).toMatch(/item\.request_reason/);
  });

  it("approve and reject change only the status and decision fields, never the reason", () => {
    const route = read("app/api/it-run/admin/refund-requests/route.ts");
    const update = route.slice(route.indexOf(".update({"), route.indexOf("})", route.indexOf(".update({")) + 2);
    expect(update).not.toMatch(/request_reason/);
  });
});

describe("the participant panel marks the reason as required", () => {
  const panel = fs.readFileSync(path.join(__dirname, "..", "..", "app/it-run/my-registrations/RefundRequestPanel.tsx"), "utf8");

  it("shows a visible asterisk, the helper text, and the field-level error", () => {
    expect(panel).toMatch(/Reason for refund <span[^>]*>\*<\/span>/);
    expect(panel).toContain("Please explain why you are requesting a refund (minimum 10 characters).");
    expect(panel).toContain('id="refund-reason-error"');
    expect(panel).toMatch(/aria-required="true"/);
  });

  it("validates with the shared rule and does not submit while busy", () => {
    expect(panel).toContain("checkRefundReason(reason)");
    expect(panel).toMatch(/if \(busy\) return;/);
  });
});
