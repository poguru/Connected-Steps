/**
 * applyPaidCategoryChange: the one place a category upgrade is applied. Used by the participant's verify
 * call and the Razorpay webhook, so it must be idempotent and must never apply the wrong amount.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */
jest.mock("@/lib/notify", () => ({ sendEmail: jest.fn().mockResolvedValue({ ok: true }) }));
import { applyPaidCategoryChange } from "@/lib/it-run-category-change";

const CHANGE_ID = "chg-1";
const ORDER = "order_1";
const PAY = "pay_1";
const AMOUNT = 50000;

function fakeDb(opts: { change?: any; regCategory?: string; moveSucceeds?: boolean; markSucceeds?: boolean } = {}) {
  const change = opts.change === undefined ? {
    id: CHANGE_ID, registration_id: "reg-1", from_category_id: "cat-10k", to_category_id: "cat-premium",
    amount_paise: AMOUNT, razorpay_order_id: ORDER, status: "pending",
  } : opts.change;
  const updates: any[] = [];
  const rpcs: any[] = [];
  const audit: any[] = [];
  const db = {
    updates, rpcs, audit,
    from(table: string) {
      const b: any = { op: "select" };
      b.select = () => b;
      b.eq = () => b;
      b.update = (p: unknown) => { b.op = "update"; updates.push({ table, payload: p }); return b; };
      b.insert = (p: unknown) => { audit.push(p); return Promise.resolve({ data: null, error: null }); };
      b.maybeSingle = () => Promise.resolve(run());
      b.then = (res: any, rej?: any) => Promise.resolve(run()).then(res, rej);
      function run(): any {
        if (table === "it_run_category_changes") {
          if (b.op === "update") return { data: opts.markSucceeds === false ? null : { id: CHANGE_ID }, error: null };
          return { data: change, error: null };
        }
        if (table === "it_run_registrations") {
          if (b.op === "update") return { data: opts.moveSucceeds === false ? null : { id: "reg-1" }, error: null };
          return { data: { registration_code: "ITR-0001", participant_count: 1 }, error: null };
        }
        return { data: null, error: null };
      }
      return b;
    },
    rpc(name: string, args: any) { rpcs.push({ name, args }); return Promise.resolve({ data: null, error: null }); },
  };
  return db as any;
}

const INPUT = { changeId: CHANGE_ID, orderId: ORDER, paymentId: PAY, amountPaise: AMOUNT, actor: "test" };

describe("applyPaidCategoryChange", () => {
  it("applies a pending change once: moves the registration and frees the old seat", async () => {
    const db = fakeDb();
    const r = await applyPaidCategoryChange(db, INPUT);
    expect(r).toEqual({ kind: "applied", registrationCode: "ITR-0001" });
    expect(db.updates.find((u: any) => u.table === "it_run_registrations").payload).toEqual({ category_id: "cat-premium" });
    expect(db.rpcs).toEqual([{ name: "itr_release_capacity", args: { p_category_id: "cat-10k", p_count: 1 } }]);
  });

  it("is idempotent: a second call (verify plus webhook) changes nothing", async () => {
    const db = fakeDb({ change: { id: CHANGE_ID, registration_id: "reg-1", from_category_id: "cat-10k", to_category_id: "cat-premium", amount_paise: AMOUNT, razorpay_order_id: ORDER, status: "paid" } });
    const r = await applyPaidCategoryChange(db, INPUT);
    expect(r.kind).toBe("already_applied");
    expect(db.updates).toEqual([]);
    expect(db.rpcs).toEqual([]);
  });

  it("refuses a payment whose amount does not match the agreed difference", async () => {
    const db = fakeDb();
    const r = await applyPaidCategoryChange(db, { ...INPUT, amountPaise: 10000 });
    expect(r.kind).toBe("amount_mismatch");
    expect(db.updates).toEqual([]);
  });

  it("refuses a payment whose order is not this change's order", async () => {
    const db = fakeDb();
    const r = await applyPaidCategoryChange(db, { ...INPUT, orderId: "order_other" });
    expect(r.kind).toBe("needs_review");
    expect(db.updates).toEqual([]);
  });

  it("does not apply a change that already closed (cancelled after the hold lapsed)", async () => {
    const db = fakeDb({ change: { id: CHANGE_ID, registration_id: "reg-1", from_category_id: "cat-10k", to_category_id: "cat-premium", amount_paise: AMOUNT, razorpay_order_id: ORDER, status: "cancelled" } });
    const r = await applyPaidCategoryChange(db, INPUT);
    expect(r.kind).toBe("not_pending");
    expect(db.updates).toEqual([]);
  });

  it("flags for review rather than dropping a payment when the registration moved meanwhile", async () => {
    const db = fakeDb({ moveSucceeds: false });
    const r = await applyPaidCategoryChange(db, INPUT);
    expect(r.kind).toBe("needs_review");
    expect(db.audit.some((a: any) => a.action === "category_change_needs_review")).toBe(true);
    // The old seat is not freed when the registration did not move
    expect(db.rpcs).toEqual([]);
  });

  it("frees the old seat only if this call marked the change paid", async () => {
    const db = fakeDb({ markSucceeds: false });
    const r = await applyPaidCategoryChange(db, INPUT);
    expect(r.kind).toBe("applied");
    expect(db.rpcs).toEqual([]);
  });
});
