/**
 * An administrator opens a refund request for any paid registration, at any time. Opening one moves no money, and the
 * request is a general refund (the amount still refundable is decided at execution).
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake Supabase builder is intentionally loosely typed */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({
  requireRole: jest.fn(),
  getClientIp: () => "203.0.113.50",
}));
jest.mock("@/lib/it-run-refunds", () => ({
  ...jest.requireActual("@/lib/it-run-refunds"),
  getRefundedAmountPaise: jest.fn().mockResolvedValue(0),
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";
import { getRefundedAmountPaise } from "@/lib/it-run-refunds";
import { POST } from "@/app/api/it-run/admin/refund-requests/create/route";

const REG = {
  id: "r-1", event_id: "ev-1", registration_code: "ITR-ABC", payment_status: "paid", registration_status: "active",
  final_price: 999, amount_paid_paise: 99900, razorpay_payment_id: "pay_1",
};

function fakeDb(opts: { reg?: Record<string, unknown> | null; insertError?: { code: string } | null } = {}) {
  const inserts: Array<{ table: string; payload: any }> = [];
  const reg = opts.reg === undefined ? REG : opts.reg;
  return {
    inserts,
    from(table: string) {
      const b: any = {};
      b.select = () => b;
      b.eq = () => b;
      b.maybeSingle = () => {
        if (table === "it_run_events") return Promise.resolve({ data: { id: "ev-1" }, error: null });
        if (table === "it_run_registrations") return Promise.resolve({ data: reg, error: null });
        return Promise.resolve({ data: null, error: null });
      };
      b.insert = (p: any) => {
        inserts.push({ table, payload: p });
        if (table === "it_run_refund_requests") {
          return { select: () => ({ maybeSingle: () => Promise.resolve({ data: opts.insertError ? null : { id: "req-1" }, error: opts.insertError ?? null }) }) };
        }
        return Promise.resolve({ data: null, error: null });
      };
      return b;
    },
  };
}

function req(body: unknown) {
  return new NextRequest("http://t/api/it-run/admin/refund-requests/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const GOOD = { registration_code: "ITR-ABC", reason: "Participant was unable to attend, agreed by email" };

beforeEach(() => {
  jest.clearAllMocks();
  (requireRole as jest.Mock).mockReturnValue({ email: "admin@example.com", role: "event_admin" });
  (getRefundedAmountPaise as jest.Mock).mockResolvedValue(0);
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("POST /api/it-run/admin/refund-requests/create", () => {
  it("refuses a caller who is not an event admin, and writes nothing", async () => {
    (requireRole as jest.Mock).mockReturnValue(null);
    const db = fakeDb();
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await POST(req(GOOD));
    expect(res.status).toBe(401);
    expect(db.inserts).toEqual([]);
  });

  it("requires a code and a real reason", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb());
    expect((await POST(req({ reason: GOOD.reason }))).status).toBe(400);
    expect((await POST(req({ registration_code: "ITR-ABC", reason: "short" }))).status).toBe(400);
  });

  it("opens a general request for a paid registration at any time: no deadline applies", async () => {
    const db = fakeDb();
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await POST(req(GOOD));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, requestId: "req-1", status: "requested", refundablePaise: 99900 });
    const request = db.inserts.find(i => i.table === "it_run_refund_requests");
    expect(request?.payload).toMatchObject({
      request_kind: "full_refund", requested_amount_paise: null, status: "requested",
      requested_by_email: "admin@example.com", target_category_id: null,
    });
  });

  it("moves no money: no refund row is written by the request", async () => {
    const db = fakeDb();
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    await POST(req(GOOD));
    expect(db.inserts.some(i => i.table === "it_run_refunds")).toBe(false);
  });

  it("only the amount still refundable is offered: a partly refunded payment shows the remainder", async () => {
    (getRefundedAmountPaise as jest.Mock).mockResolvedValue(20000);
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb({ reg: { ...REG, payment_status: "partially_refunded" } }));
    const json = await (await POST(req(GOOD))).json();
    expect(json.refundablePaise).toBe(79900);
  });

  it("refuses a fully refunded payment", async () => {
    (getRefundedAmountPaise as jest.Mock).mockResolvedValue(99900);
    const db = fakeDb();
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    expect((await POST(req(GOOD))).status).toBe(422);
    expect(db.inserts).toEqual([]);
  });

  it("refuses a free registration and an unpaid one", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb({ reg: { ...REG, payment_status: "free", final_price: 0 } }));
    expect((await POST(req(GOOD))).status).toBe(422);
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb({ reg: { ...REG, payment_status: "pending" } }));
    expect((await POST(req(GOOD))).status).toBe(422);
  });

  it("refuses an unknown registration code", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb({ reg: null }));
    expect((await POST(req(GOOD))).status).toBe(404);
  });

  it("refuses a second open request for the same registration (one open request at a time)", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb({ insertError: { code: "23505" } }));
    expect((await POST(req(GOOD))).status).toBe(409);
  });

  it("the audit entry names the registration and the actor, never a payment credential", async () => {
    const db = fakeDb();
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    await POST(req(GOOD));
    const audit = db.inserts.find(i => i.table === "it_run_audit_logs");
    expect(audit?.payload).toMatchObject({ action: "refund_request_created", actor_email: "admin@example.com" });
    expect(JSON.stringify(audit?.payload)).not.toMatch(/pay_1/);
  });
});
