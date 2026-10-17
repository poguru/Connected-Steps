/**
 * A payment captured for a registration whose window closed (seats released) is never reported as a confirmed success.
 * Nothing is confirmed, the event is logged for review, and both the verify route and the webhook say so.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake database is intentionally loosely typed */

import fs from "fs";
import path from "path";
import { confirmCheckoutPayment } from "@/lib/it-run-checkout-confirm";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

function fakeDb(regs: any[]) {
  const writes: any[] = [];
  const db = {
    writes,
    from(table: string) {
      const b: any = { op: "select" };
      b.select = () => b;
      b.eq = () => b;
      b.in = () => b;
      b.returns = () => b;
      b.insert = (p: unknown) => { b.op = "insert"; writes.push({ table, op: "insert", payload: p }); return b; };
      b.update = (p: unknown) => { b.op = "update"; writes.push({ table, op: "update", payload: p }); return b; };
      b.maybeSingle = () => Promise.resolve({ data: null, error: null });
      b.then = (res: any, rej?: any) => {
        if (table === "it_run_registrations") return Promise.resolve({ data: regs, error: null }).then(res, rej);
        if (b.op === "insert") return Promise.resolve({ data: null, error: null }).then(res, rej);
        return Promise.resolve({ data: [], error: null }).then(res, rej);
      };
      return b;
    },
  };
  return db as any;
}

const LAPSED = {
  id: "r1", registration_code: "ITRUN2-EXPIRED", lead_email: "a@x.in", final_price: 649,
  payment_status: "expired", razorpay_payment_id: null, qr_token: null, event_id: "e1",
};

describe("a payment for a lapsed registration", () => {
  it("is not confirmed, and is reported as needing review", async () => {
    const db = fakeDb([LAPSED]);
    const out = await confirmCheckoutPayment(db, { orderId: "order_1", paymentId: "pay_1", capturedAmountPaise: null, actor: "test" });
    expect(out).toEqual({ kind: "lapsed", registrationCodes: ["ITRUN2-EXPIRED"] });
  });

  it("changes no registration and records no payment", async () => {
    const db = fakeDb([LAPSED]);
    await confirmCheckoutPayment(db, { orderId: "order_1", paymentId: "pay_1", capturedAmountPaise: null, actor: "test" });
    expect(db.writes.some((w: any) => w.table === "it_run_registrations")).toBe(false);
    expect(db.writes.some((w: any) => w.table === "it_run_payments")).toBe(false);
  });

  it("is logged for review in the audit trail", async () => {
    const db = fakeDb([LAPSED]);
    await confirmCheckoutPayment(db, { orderId: "order_1", paymentId: "pay_1", capturedAmountPaise: null, actor: "test" });
    const audit = db.writes.find((w: any) => w.table === "it_run_audit_logs");
    expect(audit.payload).toMatchObject({ action: "payment_for_lapsed_registration", event_id: "e1", entity_id: "r1" });
    expect(audit.payload.detail).toMatchObject({ payment_id: "pay_1", order_id: "order_1" });
  });

  it("a payable registration on the same order is still confirmed, not reported as lapsed", async () => {
    const payable = { ...LAPSED, id: "r2", registration_code: "ITRUN2-OK", payment_status: "pending" };
    const db = fakeDb([LAPSED, payable]);
    const out = await confirmCheckoutPayment(db, { orderId: "order_1", paymentId: "pay_1", capturedAmountPaise: null, actor: "test" });
    expect(out.kind).not.toBe("lapsed");
  });
});

describe("the verify route and the webhook never call a lapsed payment a success", () => {
  it("the verify route answers 409 PAYMENT_NEEDS_REVIEW for a lapsed payment", () => {
    const route = read("app/api/it-run/payment/verify/route.ts");
    expect(route).toMatch(/result\.kind === "lapsed"/);
    expect(route).toMatch(/code: "PAYMENT_NEEDS_REVIEW"/);
    expect(route).toMatch(/\{ status: 409 \}/);
  });

  it("the webhook handles the lapsed outcome before it reads the confirmed registrations", () => {
    const hook = read("app/api/webhooks/razorpay/route.ts");
    const lapsedAt = hook.indexOf('result.kind === "lapsed"');
    const readAt = hook.indexOf("result.registrations.length");
    expect(lapsedAt).toBeGreaterThan(0);
    expect(readAt).toBeGreaterThan(lapsedAt);
  });
});
