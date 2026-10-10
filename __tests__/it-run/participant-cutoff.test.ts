/**
 * Participant cutoff: cancellations, category changes and new refund requests are open through
 * 15 January 2027 (IST) and closed from 16 January 2027 00:00:00 IST. The clock is controlled by spying
 * on Date.now(). Closed requests are refused before any read beyond ownership, and write nothing.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth", () => ({ verifyUserToken: jest.fn(), USER_SESSION_COOKIE: "cs_user_session" }));
jest.mock("@/lib/razorpay-client", () => ({ getRazorpaySDK: jest.fn(), createRefund: jest.fn(), listRefundsForPayment: jest.fn().mockResolvedValue([]) }));
jest.mock("@/lib/it-run-category-change", () => ({ sendCategoryChangeEmail: jest.fn(), applyPaidCategoryChange: jest.fn() }));
jest.mock("@/lib/it-run-refunds", () => ({
  getRefundedAmountPaise: jest.fn().mockResolvedValue(0),
  paidAmountPaise: (r: { final_price: number; amount_paid_paise: number | null }) => r.amount_paid_paise ?? r.final_price * 100,
}));

import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import {
  participantChangesOpen,
  PARTICIPANT_CHANGES_CLOSE_MS,
  CUTOFF_CLOSED_CODE,
} from "@/lib/it-run-participant-cutoff";
import { buildMyRegistrations } from "@/lib/it-run-my-registrations";
import { GET as categoryGet, POST as categoryPost } from "@/app/api/it-run/registrations/[id]/category/route";
import { POST as downgradePost } from "@/app/api/it-run/registrations/[id]/downgrade/route";
import { POST as refundRequestPost, GET as refundRequestGet } from "@/app/api/it-run/refund-requests/route";
import { GET as myRegistrationsGet } from "@/app/api/it-run/my-registrations/route";

const mockDb = getSupabaseServer as jest.Mock;
const mockVerify = verifyUserToken as jest.Mock;

const OWNER = "asha@example.com";
const REG_ID = "reg-1";
const IST_LAST_OPEN = Date.parse("2027-01-15T23:59:59.999+05:30");
const IST_CLOSE = Date.parse("2027-01-16T00:00:00+05:30");

function clockAt(ms: number) {
  return jest.spyOn(Date, "now").mockReturnValue(ms);
}

const REG = {
  id: REG_ID, event_id: "ev-1", registration_code: "ITR-AAA", category_id: "cat-10k",
  final_price: 799, amount_paid_paise: null, payment_status: "paid", registration_status: "active",
  participant_count: 1, coupon_id: null, linked_user_email: OWNER, lead_email: OWNER,
  created_at: "2026-10-01T00:00:00Z", razorpay_order_id: "o", razorpay_payment_id: "p",
  event_date: "2027-02-07", base_price: 799, discount_amount: 0, early_bird_offer_id: null,
};

/** Fake that records every call, so tests can prove a rejected request wrote nothing. */
function fakeDb(reg: any = REG) {
  const log: Array<{ table: string; op: string }> = [];
  const rpcs: string[] = [];
  // single = maybeSingle/single; otherwise the query was awaited as a list
  const answer = (table: string, op: string, single: boolean) => {
    log.push({ table, op });
    if (table === "it_run_registrations") return { data: single ? reg : [reg], error: null };
    if (table === "it_run_categories") return { data: { id: "cat-5k", name: "5K", category_type: "solo", price_rupees: 499, is_active: true, event_id: "ev-1", max_participants: null, current_participants: 0 }, error: null };
    return { data: [], error: null };
  };
  return {
    log,
    rpcs,
    rpc(name: string) { rpcs.push(name); return Promise.resolve({ data: null, error: null }); },
    from(table: string) {
      const b: any = {};
      let op = "select";
      for (const m of ["select", "eq", "in", "is", "order", "returns", "limit"]) b[m] = () => b;
      b.insert = () => { op = "insert"; return b; };
      b.update = () => { op = "update"; return b; };
      b.maybeSingle = () => Promise.resolve(answer(table, op, true));
      b.single = () => Promise.resolve(answer(table, op, true));
      b.then = (res: any, rej?: any) => Promise.resolve(answer(table, op, false)).then(res, rej);
      return b;
    },
  };
}

const writes = (db: ReturnType<typeof fakeDb>) => db.log.filter(l => l.op !== "select");

function req(url: string, body?: unknown, token = "tok") {
  return new NextRequest(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", cookie: `cs_user_session=${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = (id = REG_ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockReturnValue(OWNER);
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── The boundary ───────────────────────────────────────────────────────────────

describe("the cutoff boundary (Asia/Kolkata)", () => {
  it("is open at 15 January 2027, 23:59:59.999 IST", () => {
    expect(participantChangesOpen(IST_LAST_OPEN)).toBe(true);
  });

  it("is closed at 16 January 2027, 00:00:00 IST", () => {
    expect(participantChangesOpen(IST_CLOSE)).toBe(false);
    expect(IST_CLOSE).toBe(PARTICIPANT_CHANGES_CLOSE_MS);
  });

  it("is the same instant in UTC: 15 January 18:30:00 UTC is closed, 18:29:59.999 UTC is open", () => {
    expect(participantChangesOpen(Date.parse("2027-01-15T18:29:59.999Z"))).toBe(true);
    expect(participantChangesOpen(Date.parse("2027-01-15T18:30:00Z"))).toBe(false);
  });

  it("uses the server clock, so a timestamp sent by the client cannot reopen it", async () => {
    clockAt(IST_CLOSE);
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await downgradePost(
      req(`http://t/api/it-run/registrations/${REG_ID}/downgrade`, { categoryId: "cat-5k", reason: "Moving to 5K this year", now: "2027-01-10T00:00:00Z", open: true }),
      params(),
    );
    expect(res.status).toBe(403);
  });
});

// ── Category change ────────────────────────────────────────────────────────────

describe("category change routes", () => {
  it("GET options after the cutoff: 403 CHANGES_CLOSED, nothing read beyond ownership", async () => {
    clockAt(IST_CLOSE);
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await categoryGet(req(`http://t/api/it-run/registrations/${REG_ID}/category`), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe(CUTOFF_CLOSED_CODE);
    expect(db.log.map(l => l.table)).toEqual(["it_run_registrations"]);
  });

  it("POST after the cutoff: 403, and no capacity, registration or payment write", async () => {
    clockAt(IST_CLOSE);
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await categoryPost(req(`http://t/api/it-run/registrations/${REG_ID}/category`, { categoryId: "cat-5k" }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe(CUTOFF_CLOSED_CODE);
    expect(writes(db)).toEqual([]);
    expect(db.rpcs).toEqual([]);
  });

  it("POST before the cutoff gets past the cutoff check", async () => {
    clockAt(IST_LAST_OPEN);
    mockDb.mockReturnValue(fakeDb());
    const res = await categoryPost(req(`http://t/api/it-run/registrations/${REG_ID}/category`, { categoryId: "cat-missing" }), params());
    expect(res.status).not.toBe(403);
  });

  it("an unsigned request after the cutoff is refused as unauthenticated, not told about the cutoff", async () => {
    clockAt(IST_CLOSE);
    mockVerify.mockReturnValue(null);
    mockDb.mockReturnValue(fakeDb());
    const res = await categoryGet(req(`http://t/api/it-run/registrations/${REG_ID}/category`, undefined, "bad"), params());
    expect(res.status).toBe(401);
  });
});

// ── Refund requests and downgrades ─────────────────────────────────────────────

describe("refund requests and downgrades", () => {
  it("a new refund request after the cutoff is refused with no insert", async () => {
    clockAt(IST_CLOSE);
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await refundRequestPost(req("http://t/api/it-run/refund-requests", { registration_code: "ITR-AAA", reason: "Cannot attend this year" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe(CUTOFF_CLOSED_CODE);
    expect(writes(db)).toEqual([]);
  });

  it("a downgrade request after the cutoff is refused with no insert and no capacity change", async () => {
    clockAt(IST_CLOSE);
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await downgradePost(req(`http://t/api/it-run/registrations/${REG_ID}/downgrade`, { categoryId: "cat-5k", reason: "Moving to the 5K" }), params());
    expect(res.status).toBe(403);
    expect(writes(db)).toEqual([]);
    expect(db.rpcs).toEqual([]);
  });

  it("a request made just before the cutoff is still accepted by the cutoff check", async () => {
    clockAt(IST_LAST_OPEN);
    mockDb.mockReturnValue(fakeDb());
    const res = await refundRequestPost(req("http://t/api/it-run/refund-requests", { registration_code: "ITR-AAA", reason: "Cannot attend this year" }));
    expect(res.status).not.toBe(403);
  });

  it("existing refund requests stay visible to the participant after the cutoff", async () => {
    clockAt(IST_CLOSE);
    mockDb.mockReturnValue(fakeDb());
    const res = await refundRequestGet(req("http://t/api/it-run/refund-requests"));
    expect(res.status).toBe(200);
  });

  it("the downgrade rule applies to parent-and-child and duo bookings as well", async () => {
    clockAt(IST_CLOSE);
    for (const participant_count of [1, 2]) {
      const db = fakeDb({ ...REG, participant_count });
      mockDb.mockReturnValue(db);
      const res = await downgradePost(req(`http://t/api/it-run/registrations/${REG_ID}/downgrade`, { categoryId: "cat-5k", reason: "Moving to the 5K" }), params());
      expect(res.status).toBe(403);
      expect(writes(db)).toEqual([]);
    }
  });
});

// ── Registrations list: notice and actions ─────────────────────────────────────

describe("registrations list after the cutoff", () => {
  it("reports changes as closed and offers no change or refund action", async () => {
    clockAt(IST_CLOSE);
    mockDb.mockReturnValue(fakeDb());
    const body = await (await myRegistrationsGet(req("http://t/api/it-run/my-registrations"))).json();
    expect(body.participantChangesOpen).toBe(false);
    expect(body.registrations.every((r: any) => r.actions.canChangeCategory === false && r.actions.canRequestRefund === false)).toBe(true);
  });

  it("reports changes as open before the cutoff", async () => {
    clockAt(IST_LAST_OPEN);
    mockDb.mockReturnValue(fakeDb());
    const body = await (await myRegistrationsGet(req("http://t/api/it-run/my-registrations"))).json();
    expect(body.participantChangesOpen).toBe(true);
  });

  it("the list builder gives no actions when changes are closed, whatever the state", () => {
    const row = {
      id: "r", registration_code: "ITR-1", payment_status: "paid", registration_status: "active", final_price: 799,
      base_price: 799, discount_amount: 0, early_bird_offer_id: null, participant_count: 1,
      created_at: "2026-10-01", category: null, event: null,
    };
    const closed = buildMyRegistrations([row], [], [], new Map(), false);
    expect(closed[0].actions).toEqual({ canChangeCategory: false, canRequestRefund: false });
  });
});

// ── Admin is not behind the participant cutoff ─────────────────────────────────

describe("admin processing", () => {
  it("the admin refund route does not depend on the participant cutoff", () => {
    const adminRoute = fs.readFileSync(path.join(__dirname, "..", "..", "app/api/it-run/admin/refund/route.ts"), "utf8");
    expect(adminRoute).not.toMatch(/participant-cutoff|participantChangesOpen/);
  });
});
