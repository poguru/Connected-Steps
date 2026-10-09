/**
 * Category upgrade verification: the category changes only after a valid, captured payment for the
 * exact agreed amount. Repeated calls change nothing further.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth", () => ({ verifyUserToken: jest.fn(), USER_SESSION_COOKIE: "cs_user_session" }));
jest.mock("@/lib/razorpay-security", () => ({ verifyPaymentSignature: jest.fn() }));
jest.mock("@/lib/razorpay-client", () => ({ getPayment: jest.fn() }));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { verifyPaymentSignature } from "@/lib/razorpay-security";
import { getPayment } from "@/lib/razorpay-client";
import { POST } from "@/app/api/it-run/registrations/[id]/category/verify/route";

const mockDb = getSupabaseServer as jest.Mock;
const mockUser = verifyUserToken as jest.Mock;
const mockSig = verifyPaymentSignature as jest.Mock;
const mockPay = getPayment as jest.Mock;

const REG_ID = "aaaaaaaa-1111-4111-8111-111111111111";
const OWNER = "owner@example.com";
const FROM = "cat-10k";
const TO = "cat-premium";
const AMOUNT = 50000; // ₹500 difference, paise

function fakeDb(change: any = { id: "chg1", registration_id: REG_ID, from_category_id: FROM, to_category_id: TO, amount_paise: AMOUNT, razorpay_order_id: "order_1", status: "pending" }) {
  const updates: any[] = [];
  const rpcs: any[] = [];
  const db = {
    updates, rpcs,
    from(table: string) {
      const b: any = { op: "select" };
      b.select = () => b;
      b.eq = () => b;
      b.update = (p: unknown) => { b.op = "update"; updates.push({ table, payload: p }); return b; };
      b.insert = () => { b.op = "insert"; return b; };
      b.maybeSingle = () => Promise.resolve(run());
      b.then = (res: any, rej?: any) => Promise.resolve(run()).then(res, rej);
      function run(): any {
        if (table === "it_run_registrations") {
          if (b.op === "update") return { data: { id: REG_ID }, error: null };
          return { data: { id: REG_ID, registration_code: "ITR-0001", category_id: FROM, participant_count: 1, linked_user_email: OWNER, payment_status: "paid" }, error: null };
        }
        if (table === "it_run_category_changes") {
          if (b.op === "update") return { data: { id: "chg1" }, error: null };
          return { data: change, error: null };
        }
        return { data: { id: "x" }, error: null };
      }
      return b;
    },
    rpc(name: string, args: any) { rpcs.push({ name, args }); return Promise.resolve({ data: null, error: null }); },
  };
  return db;
}

function req(body: unknown) {
  return new NextRequest(`http://t/api/it-run/registrations/${REG_ID}/category/verify`, {
    method: "POST", headers: { "content-type": "application/json", cookie: "cs_user_session=s" }, body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: REG_ID }) };
const GOOD = { changeId: "chg1", orderId: "order_1", paymentId: "pay_1", signature: "sig" };

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.mockReturnValue(OWNER);
  mockSig.mockReturnValue(true);
  mockPay.mockResolvedValue({ id: "pay_1", order_id: "order_1", captured: true, amount: AMOUNT });
});

describe("verification gates", () => {
  it("rejects an invalid signature before touching anything", async () => {
    mockSig.mockReturnValue(false);
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await POST(req(GOOD), params);
    expect(res.status).toBe(400);
    expect(db.updates).toEqual([]);
    expect(mockPay).not.toHaveBeenCalled();
  });

  it("rejects a payment for a different order than this change", async () => {
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await POST(req({ ...GOOD, orderId: "order_other" }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CHANGE_MISMATCH");
    expect(db.updates).toEqual([]);
  });

  it("does not apply the change when Razorpay reports a different amount", async () => {
    mockPay.mockResolvedValue({ id: "pay_1", order_id: "order_1", captured: true, amount: 10000 });
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await POST(req(GOOD), params);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("PAYMENT_PENDING");
    expect(db.updates.some(u => u.table === "it_run_registrations")).toBe(false);
  });

  it("does not apply the change when the payment is not captured", async () => {
    mockPay.mockResolvedValue({ id: "pay_1", order_id: "order_1", captured: false, amount: AMOUNT });
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await POST(req(GOOD), params);
    expect(res.status).toBe(409);
    expect(db.updates.some(u => u.table === "it_run_registrations")).toBe(false);
  });

  it("refuses someone else's registration", async () => {
    mockUser.mockReturnValue("someone-else@example.com");
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await POST(req(GOOD), params);
    expect(res.status).toBe(404);
    expect(db.updates).toEqual([]);
  });
});

describe("a verified payment", () => {
  it("moves the registration to the new category and frees the old seat once", async () => {
    const db = fakeDb();
    mockDb.mockReturnValue(db);

    const res = await POST(req(GOOD), params);

    expect(res.status).toBe(200);
    const regUpdate = db.updates.find(u => u.table === "it_run_registrations");
    expect(regUpdate?.payload).toEqual({ category_id: TO });
    expect(db.rpcs).toEqual([{ name: "itr_release_capacity", args: { p_category_id: FROM, p_count: 1 } }]);
    // The QR and participant rows are never written by a category change
    expect(db.updates.some(u => u.table === "it_run_participants")).toBe(false);
  });

  it("a repeated verify after success changes nothing further", async () => {
    const db = fakeDb({ id: "chg1", registration_id: REG_ID, from_category_id: FROM, to_category_id: TO, amount_paise: AMOUNT, razorpay_order_id: "order_1", status: "paid" });
    mockDb.mockReturnValue(db);
    const res = await POST(req(GOOD), params);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.alreadyApplied).toBe(true);
    expect(db.updates).toEqual([]);
    expect(db.rpcs).toEqual([]);
  });
});
