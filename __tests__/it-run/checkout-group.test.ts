/**
 * Checkout groups: several registrations paid by one Razorpay payment.
 * Covers which groups may be paid, the amount, and confirmation of a shared payment (all or nothing, repeated
 * payments, amount mismatch, and a payment that is recorded once).
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));

import { checkCheckoutGroup, paymentCoversRegistrations, type CheckoutRegistration } from "@/lib/it-run-checkout";
import { confirmCheckoutPayment } from "@/lib/it-run-checkout-confirm";

const EVENT = "ev-1";

function reg(over: Partial<CheckoutRegistration> & { id: string }): CheckoutRegistration {
  return {
    registration_code: `ITR-${over.id}`, event_id: EVENT, lead_email: "asha@example.com",
    final_price: 999, payment_status: "pending", razorpay_order_id: null, ...over,
  };
}

// ── Which groups may be paid ──────────────────────────────────────────────────

describe("checkCheckoutGroup", () => {
  it("accepts a duo and a 10K from one session, at the sum of their prices", () => {
    const regs = [reg({ id: "duo", final_price: 1399 }), reg({ id: "tenk", final_price: 999 })];
    const r = checkCheckoutGroup(["duo", "tenk"], regs);
    expect(r).toEqual({ ok: true, totalPaise: (1399 + 999) * 100, existingOrderId: null });
  });

  it("refuses a registration that is already paid", () => {
    const r = checkCheckoutGroup(["a", "b"], [reg({ id: "a" }), reg({ id: "b", payment_status: "paid" })]);
    expect(r.ok).toBe(false);
  });

  it("refuses a registration from another event or another email", () => {
    expect(checkCheckoutGroup(["a", "b"], [reg({ id: "a" }), reg({ id: "b", event_id: "ev-2" })]).ok).toBe(false);
    expect(checkCheckoutGroup(["a", "b"], [reg({ id: "a" }), reg({ id: "b", lead_email: "someone@else.com" })]).ok).toBe(false);
  });

  it("treats the same email in another letter case as the same person", () => {
    expect(checkCheckoutGroup(["a", "b"], [reg({ id: "a" }), reg({ id: "b", lead_email: "ASHA@example.com" })]).ok).toBe(true);
  });

  it("refuses a free or failed registration in a paid checkout", () => {
    expect(checkCheckoutGroup(["a", "b"], [reg({ id: "a" }), reg({ id: "b", final_price: 0 })]).ok).toBe(false);
    expect(checkCheckoutGroup(["a", "b"], [reg({ id: "a" }), reg({ id: "b", payment_status: "failed" })]).ok).toBe(false);
  });

  it("refuses registrations that are already in different payments", () => {
    const r = checkCheckoutGroup(["a", "b"], [reg({ id: "a", razorpay_order_id: "o1" }), reg({ id: "b", razorpay_order_id: "o2" })]);
    expect(r.ok).toBe(false);
  });

  it("reuses the order when a retry of the same checkout names the same order", () => {
    const r = checkCheckoutGroup(["a", "b"], [reg({ id: "a", razorpay_order_id: "o1" }), reg({ id: "b", razorpay_order_id: "o1" })]);
    expect(r).toEqual({ ok: true, totalPaise: 999 * 2 * 100, existingOrderId: "o1" });
  });

  it("refuses a request for a registration that is not found", () => {
    expect(checkCheckoutGroup(["a", "missing"], [reg({ id: "a" })]).ok).toBe(false);
  });

  it("refuses an empty request and more registrations than one checkout can hold", () => {
    expect(checkCheckoutGroup([], []).ok).toBe(false);
    const ids = Array.from({ length: 11 }, (_, i) => `r${i}`);
    expect(checkCheckoutGroup(ids, ids.map(id => reg({ id }))).ok).toBe(false);
  });
});

describe("paymentCoversRegistrations", () => {
  it("matches only the exact total owed", () => {
    const regs = [{ final_price: 1399 }, { final_price: 999 }];
    expect(paymentCoversRegistrations((1399 + 999) * 100, regs)).toBe(true);
    expect(paymentCoversRegistrations(1399 * 100, regs)).toBe(false);
    expect(paymentCoversRegistrations(0, [])).toBe(false);
  });
});

// ── Confirmation of a shared payment ──────────────────────────────────────────

type Row = { id: string; registration_code: string; lead_email: string; final_price: number; payment_status: string; razorpay_payment_id: string | null; qr_token: string | null };

/** Fake for confirmCheckoutPayment: registrations on an order, a payments table keyed by payment id, and an update
 *  that honours the status guard (so a registration already paid is not moved again). */
function fakeDb(rows: Row[], recordedPayments: string[] = []) {
  const payments = [...recordedPayments];
  const inserts: any[] = [];
  return {
    payments, inserts,
    from(table: string) {
      const q: any = { table, filters: {}, op: "select" };
      const b: any = {};
      b.select = () => b;
      b.eq = (k: string, v: unknown) => { q.filters[k] = v; return b; };
      b.in = (k: string, v: unknown[]) => { q.filters[k + "_in"] = v; return b; };
      b.update = (p: any) => { q.op = "update"; q.payload = p; return b; };
      b.insert = (p: any) => { q.op = "insert"; q.payload = p; return b; };
      b.returns = () => b;
      const result = (): any => {
        if (table === "it_run_payments") {
          if (q.op === "insert") {
            if (payments.includes(q.payload.razorpay_payment_id)) return { data: null, error: { code: "23505", message: "dup" } };
            payments.push(q.payload.razorpay_payment_id); inserts.push(q.payload); return { data: null, error: null };
          }
          const hit = payments.includes(q.filters.razorpay_payment_id) ? [{ id: "p" }] : [];
          return { data: hit[0] ?? null, error: null };
        }
        // it_run_registrations
        if (q.op === "update") {
          const statuses: string[] = q.filters.payment_status_in ?? [];
          const targets = rows.filter(r => (q.filters.id_in ?? []).includes(r.id) && statuses.includes(r.payment_status));
          for (const t of targets) { t.payment_status = q.payload.payment_status; t.razorpay_payment_id = q.payload.razorpay_payment_id; }
          return { data: targets.map(t => ({ id: t.id })), error: null };
        }
        return { data: rows.filter(r => !q.filters.razorpay_order_id || (r as any).razorpay_order_id === q.filters.razorpay_order_id), error: null };
      };
      b.maybeSingle = () => Promise.resolve(result());
      b.single = () => Promise.resolve(result());
      b.then = (res: any, rej?: any) => Promise.resolve(result()).then(res, rej);
      return b;
    },
  };
}

function orderRows(): Row[] {
  return [
    { id: "duo", registration_code: "ITR-DUO", lead_email: "asha@example.com", final_price: 1399, payment_status: "payment_attempted", razorpay_payment_id: null, qr_token: "qr-duo-1" },
    { id: "tenk", registration_code: "ITR-10K", lead_email: "asha@example.com", final_price: 999, payment_status: "payment_attempted", razorpay_payment_id: null, qr_token: "qr-10k" },
  ];
}

const ORDER = "order_group_1";
const withOrder = (rows: Row[]) => rows.map(r => ({ ...r, razorpay_order_id: ORDER })) as any;

describe("confirmCheckoutPayment", () => {
  it("confirms every registration on the order with one payment, and records the payment once", async () => {
    const rows = withOrder(orderRows());
    const db = fakeDb(rows);
    const r = await confirmCheckoutPayment(db as any, { orderId: ORDER, paymentId: "pay_1", capturedAmountPaise: (1399 + 999) * 100, actor: "t" });
    expect(r.kind).toBe("confirmed");
    if (r.kind === "confirmed") {
      expect(r.registrations.map((x: { registration_code: string }) => x.registration_code).sort()).toEqual(["ITR-10K", "ITR-DUO"]);
      expect(r.skipped).toEqual([]);
    }
    expect(rows.every((x: Row) => x.payment_status === "paid" && x.razorpay_payment_id === "pay_1")).toBe(true);
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0].amount_paise).toBe((1399 + 999) * 100);
  });

  it("each registration keeps its own QR code", async () => {
    const rows = withOrder(orderRows());
    const r = await confirmCheckoutPayment(fakeDb(rows) as any, { orderId: ORDER, paymentId: "pay_1", capturedAmountPaise: null, actor: "t" });
    if (r.kind !== "confirmed") throw new Error("expected confirmed");
    const qrs = Object.fromEntries(r.registrations.map(x => [x.registration_code, x.qr_token]));
    expect(qrs).toEqual({ "ITR-DUO": "qr-duo-1", "ITR-10K": "qr-10k" });
  });

  it("a repeated delivery of the same payment changes nothing and sends nothing again", async () => {
    const rows = withOrder(orderRows());
    const db = fakeDb(rows, ["pay_1"]);
    const r = await confirmCheckoutPayment(db as any, { orderId: ORDER, paymentId: "pay_1", capturedAmountPaise: null, actor: "t" });
    expect(r.kind).toBe("already");
    expect(rows.every((x: Row) => x.payment_status === "payment_attempted")).toBe(true);
  });

  it("refuses a captured amount that does not match what the registrations owe, and changes nothing", async () => {
    const rows = withOrder(orderRows());
    const db = fakeDb(rows);
    const r = await confirmCheckoutPayment(db as any, { orderId: ORDER, paymentId: "pay_1", capturedAmountPaise: 999 * 100, actor: "t" });
    expect(r.kind).toBe("amount_mismatch");
    expect(rows.every((x: Row) => x.payment_status === "payment_attempted")).toBe(true);
    expect(db.inserts).toHaveLength(0);
  });

  it("does not move a registration that is already paid, and confirms the others", async () => {
    const rows = withOrder(orderRows());
    rows[1].payment_status = "paid";
    const r = await confirmCheckoutPayment(fakeDb(rows) as any, { orderId: ORDER, paymentId: "pay_2", capturedAmountPaise: null, actor: "t" });
    if (r.kind !== "confirmed") throw new Error("expected confirmed");
    expect(r.registrations.map((x: { registration_code: string }) => x.registration_code)).toEqual(["ITR-DUO"]);
    expect(rows[1].payment_status).toBe("paid");
  });

  it("reports nothing found for an order with no registrations", async () => {
    const r = await confirmCheckoutPayment(fakeDb([]) as any, { orderId: "none", paymentId: "pay_3", capturedAmountPaise: null, actor: "t" });
    expect(r.kind).toBe("not_found");
  });
});
