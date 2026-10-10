/**
 * Downgrade request: creates a request for admin review with the refund amount computed on the server.
 * It never changes the registration or the category, and it refuses anything that is not a true downgrade.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth", () => ({ verifyUserToken: jest.fn(), USER_SESSION_COOKIE: "cs_user_session" }));
jest.mock("@/lib/it-run-refunds", () => ({ getRefundedAmountPaise: jest.fn().mockResolvedValue(0) }));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { getRefundedAmountPaise } from "@/lib/it-run-refunds";
import { POST } from "@/app/api/it-run/registrations/[id]/downgrade/route";

const mockDb = getSupabaseServer as jest.Mock;
const mockVerify = verifyUserToken as jest.Mock;
const mockRefunded = getRefundedAmountPaise as jest.Mock;

const OWNER = "asha@example.com";
const REG_ID = "reg-1";
const EVENT = "ev-1";

const REG = {
  id: REG_ID, event_id: EVENT, registration_code: "ITR-AAA", category_id: "cat-10k",
  final_price: 799, payment_status: "paid", registration_status: "active", participant_count: 1,
  coupon_id: null, linked_user_email: OWNER,
};

const TARGET_OK = {
  id: "cat-5k", name: "5K Timed Run", category_type: "solo", price_rupees: 499,
  max_participants: null, current_participants: 10,
};

function fakeDb(opts: { reg?: any; target?: any; insert?: { data?: any; error?: any } }) {
  const log: Array<{ table: string; method: string; args: unknown[] }> = [];
  return {
    log,
    from(table: string) {
      const b: any = {};
      for (const m of ["select", "eq", "update", "insert"]) {
        b[m] = (...args: unknown[]) => { log.push({ table, method: m, args }); return b; };
      }
      b.maybeSingle = () => {
        if (table === "it_run_registrations") return Promise.resolve({ data: opts.reg === undefined ? REG : opts.reg, error: null });
        if (table === "it_run_categories") return Promise.resolve({ data: opts.target === undefined ? TARGET_OK : opts.target, error: null });
        if (table === "it_run_refund_requests") {
          const ins = opts.insert ?? { data: { id: "rq-1", status: "requested", created_at: "2026-10-11T00:00:00Z" }, error: null };
          return Promise.resolve({ data: ins.data ?? null, error: ins.error ?? null });
        }
        return Promise.resolve({ data: null, error: null });
      };
      return b;
    },
  };
}

function req(body: unknown, token = "tok") {
  return new NextRequest(`http://t/api/it-run/registrations/${REG_ID}/downgrade`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `cs_user_session=${token}` },
    body: JSON.stringify(body),
  });
}

const GOOD_BODY = { categoryId: "cat-5k", reason: "I can't train for the 10K this year." };

async function call(body: unknown = GOOD_BODY, opts: Parameters<typeof fakeDb>[0] = {}) {
  const db = fakeDb(opts);
  mockDb.mockReturnValue(db);
  const res = await POST(req(body), { params: Promise.resolve({ id: REG_ID }) });
  return { res, db };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockReturnValue(OWNER);
  mockRefunded.mockResolvedValue(0);
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

describe("POST /api/it-run/registrations/[id]/downgrade", () => {
  it("requires a signed-in session", async () => {
    mockVerify.mockReturnValue(null);
    const { res } = await call();
    expect(res.status).toBe(401);
  });

  it("returns the same 404 for a missing registration and for someone else's", async () => {
    const missing = await call(GOOD_BODY, { reg: null });
    const other = await call(GOOD_BODY, { reg: { ...REG, linked_user_email: "someone@else.com" } });
    expect(missing.res.status).toBe(404);
    expect(other.res.status).toBe(404);
    expect(await missing.res.text()).toBe(await other.res.text());
  });

  it("refuses a registration with a discount code", async () => {
    const { res } = await call(GOOD_BODY, { reg: { ...REG, coupon_id: "c-1" } });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/discount code/);
  });

  it("refuses a category that costs the same or more", async () => {
    const { res } = await call(GOOD_BODY, { target: { ...TARGET_OK, price_rupees: 799 } });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/same or more/);
  });

  it("refuses a free category, which is a full refund and not a downgrade", async () => {
    const { res } = await call(GOOD_BODY, { target: { ...TARGET_OK, price_rupees: 0 } });
    expect(res.status).toBe(422);
  });

  it("refuses a group size that does not fit the target", async () => {
    const { res } = await call(GOOD_BODY, { target: { ...TARGET_OK, category_type: "duo" } });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/group size/);
  });

  it("refuses a full target category", async () => {
    const { res } = await call(GOOD_BODY, { target: { ...TARGET_OK, max_participants: 10, current_participants: 10 } });
    expect(res.status).toBe(409);
  });

  it("refuses an amount larger than what is left to refund", async () => {
    mockRefunded.mockResolvedValue(70000); // ₹700 already refunded of ₹799
    const { res } = await call();
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/not enough left/);
  });

  it("refuses a reason that is too short", async () => {
    const { res } = await call({ categoryId: "cat-5k", reason: "short" });
    expect(res.status).toBe(400);
  });

  it("creates a downgrade request with the server-computed difference in paise", async () => {
    const { res, db } = await call();
    expect(res.status).toBe(201);
    const insert = db.log.find(l => l.table === "it_run_refund_requests" && l.method === "insert");
    expect(insert?.args[0]).toMatchObject({
      registration_id: REG_ID,
      request_kind: "downgrade",
      requested_amount_paise: (799 - 499) * 100,
      target_category_id: "cat-5k",
      status: "requested",
    });
    const body = await res.json();
    expect(body.message).toMatch(/Nothing has changed yet/);
  });

  it("never changes the registration or the category when requesting", async () => {
    const { db } = await call();
    const writes = db.log.filter(l => l.method === "update" || (l.method === "insert" && l.table !== "it_run_refund_requests"));
    expect(writes).toEqual([]);
    expect(db.log.some(l => l.table === "it_run_refunds" || l.table === "it_run_registrations" && l.method === "update")).toBe(false);
  });

  it("returns 409 when a request is already open for this registration", async () => {
    const { res } = await call(GOOD_BODY, { insert: { data: null, error: { code: "23505", message: "dup" } } });
    expect(res.status).toBe(409);
  });
});
