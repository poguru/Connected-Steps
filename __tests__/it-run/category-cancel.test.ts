/**
 * Cancelling one category after an ID rejection: the 90% refund, only that category's runners are cancelled, the seats
 * are given back once, and nothing is cancelled when a refund is already open.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake database is intentionally loosely typed */

import { categoryRefundPaise, cancelRunnerCategory, CATEGORY_REFUND_PERCENT } from "@/lib/it-run-category-cancel";

describe("categoryRefundPaise", () => {
  it("refunds 90% of the category's price when there is no discount", () => {
    // 10K Timed Run at Rs. 999: 90% is Rs. 899.10
    expect(categoryRefundPaise({ lineBaseRupees: 999, bookingBaseRupees: 2398, bookingDiscountRupees: 0 })).toBe(89910);
  });

  it("takes this category's share of the discount before the 90%", () => {
    // Rs. 240 discount over a Rs. 2,398 booking: the 999 line carries Rs. 99.98 of it, so Rs. 899.02 is paid, and 90% of that
    expect(categoryRefundPaise({ lineBaseRupees: 999, bookingBaseRupees: 2398, bookingDiscountRupees: 240 })).toBe(80911);
  });

  it("refunds nothing for an empty category, and never more than the category's price", () => {
    expect(categoryRefundPaise({ lineBaseRupees: 0, bookingBaseRupees: 2398, bookingDiscountRupees: 0 })).toBe(0);
    expect(categoryRefundPaise({ lineBaseRupees: 999, bookingBaseRupees: 999, bookingDiscountRupees: 0 })).toBeLessThanOrEqual(999 * 100);
    expect(CATEGORY_REFUND_PERCENT).toBe(90);
  });
});

interface Row { [key: string]: any }

function fakeDb(opts: {
  participant?: Row | null;
  registration?: Row | null;
  category?: Row | null;
  siblings?: Row[];
  refundConflict?: boolean;
}) {
  const writes: Array<{ table: string; op: string; payload?: any; filters?: any }> = [];
  const rpcs: Array<{ name: string; args: any }> = [];
  const tables: Record<string, any> = {
    it_run_participants: opts.participant ?? null,
    it_run_registrations: opts.registration ?? null,
    it_run_categories: opts.category ?? null,
  };
  return {
    writes, rpcs,
    from(table: string) {
      const b: any = { op: "select" };
      b.select = () => b;
      b.eq = (k: string, v: unknown) => { (b.filters ??= {})[k] = v; return b; };
      b.is = () => b;
      b.in = (k: string, v: unknown) => { (b.filters ??= {})[k] = v; return b; };
      b.returns = () => b;
      b.insert = (payload: any) => { b.op = "insert"; b.payload = payload; writes.push({ table, op: "insert", payload }); return b; };
      b.update = (payload: any) => { b.op = "update"; b.payload = payload; return b; };
      b.maybeSingle = () => {
        if (b.op === "insert") {
          if (table === "it_run_refund_requests" && opts.refundConflict) return Promise.resolve({ data: null, error: { code: "23505" } });
          return Promise.resolve({ data: { id: "rr-1" }, error: null });
        }
        return Promise.resolve({ data: tables[table], error: null });
      };
      b.then = (res: any, rej?: any) => {
        if (b.op === "update") writes.push({ table, op: "update", payload: b.payload, filters: b.filters });
        const data = table === "it_run_participants" && b.op === "select" ? (opts.siblings ?? []) : [];
        return Promise.resolve({ data, error: null }).then(res, rej);
      };
      return b;
    },
    rpc(name: string, args: any) {
      rpcs.push({ name, args });
      return Promise.resolve({ data: null, error: null });
    },
  };
}

const PAID_REG = {
  id: "reg-1", event_id: "ev-1", category_id: "cat-10k", payment_status: "paid", final_price: 2398,
  base_price: 2398, discount_amount: 0, registration_status: "active",
};
const SOLO_CAT = { id: "cat-10k", name: "10K Timed Run", category_type: "solo", price_rupees: 999 };
const DUO_CAT = { id: "cat-duo", name: "5K Duo Challenge", category_type: "duo", price_rupees: 1399 };

describe("cancelRunnerCategory", () => {
  it("cancels only the rejected runner's category, records the 90% refund, and gives the seats back", async () => {
    const db = fakeDb({
      participant: { id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: null },
      registration: PAID_REG,
      category: SOLO_CAT,
      siblings: [
        { id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: null },
        { id: "p-bala", registration_id: "reg-1", category_id: "cat-duo", cancelled_at: null },
        { id: "p-chitra", registration_id: "reg-1", category_id: "cat-duo", cancelled_at: null },
      ],
    });
    const out = await cancelRunnerCategory(db as any, { participantId: "p-asha", reason: "unreadable", actorEmail: "v@x" });
    expect(out).toMatchObject({ status: "cancelled", runners: 1, refundPaise: 89910, categoryName: "10K Timed Run" });

    const request = db.writes.find(w => w.table === "it_run_refund_requests")!;
    expect(request.payload).toMatchObject({ request_kind: "category_cancel", requested_amount_paise: 89910, target_category_id: "cat-10k", status: "requested" });

    const cancelled = db.writes.find(w => w.table === "it_run_participants" && w.op === "update")!;
    expect(cancelled.filters.id).toEqual(["p-asha"]); // not the duo runners
    expect(db.rpcs).toEqual([{ name: "itr_release_capacity", args: { p_category_id: "cat-10k", p_count: 1 } }]);
  });

  it("cancels every runner of the rejected category, including a pair's partner", async () => {
    const db = fakeDb({
      participant: { id: "p-bala", registration_id: "reg-1", category_id: "cat-duo", cancelled_at: null },
      registration: { ...PAID_REG, category_id: "cat-10k", final_price: 2398, base_price: 2398 },
      category: DUO_CAT,
      siblings: [
        { id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: null },
        { id: "p-bala", registration_id: "reg-1", category_id: "cat-duo", cancelled_at: null },
        { id: "p-chitra", registration_id: "reg-1", category_id: "cat-duo", cancelled_at: null },
      ],
    });
    const out = await cancelRunnerCategory(db as any, { participantId: "p-bala", reason: "unreadable", actorEmail: "v@x" });
    expect(out).toMatchObject({ status: "cancelled", runners: 2 });
    const cancelled = db.writes.find(w => w.table === "it_run_participants" && w.op === "update")!;
    expect(cancelled.filters.id.sort()).toEqual(["p-bala", "p-chitra"]);
    expect(db.rpcs[0].args).toEqual({ p_category_id: "cat-duo", p_count: 2 });
  });

  it("refuses when another refund is already open, and cancels nothing", async () => {
    const db = fakeDb({
      participant: { id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: null },
      registration: PAID_REG,
      category: SOLO_CAT,
      siblings: [{ id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: null }],
      refundConflict: true,
    });
    const out = await cancelRunnerCategory(db as any, { participantId: "p-asha", reason: "x", actorEmail: "v@x" });
    expect(out.status).toBe("refund_already_open");
    expect(db.writes.some(w => w.table === "it_run_participants")).toBe(false);
    expect(db.rpcs).toEqual([]);
  });

  it("does nothing for a runner who is already cancelled", async () => {
    const db = fakeDb({ participant: { id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: "2026-10-20T00:00:00Z" } });
    const out = await cancelRunnerCategory(db as any, { participantId: "p-asha", reason: "x", actorEmail: "v@x" });
    expect(out.status).toBe("already_cancelled");
    expect(db.writes).toEqual([]);
  });

  it("does nothing for an unpaid registration: there is nothing to refund", async () => {
    const db = fakeDb({
      participant: { id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: null },
      registration: { ...PAID_REG, payment_status: "pending" },
      category: SOLO_CAT,
    });
    const out = await cancelRunnerCategory(db as any, { participantId: "p-asha", reason: "x", actorEmail: "v@x" });
    expect(out.status).toBe("not_paid");
    expect(db.writes).toEqual([]);
  });
});

describe("a free registration whose ID is rejected", () => {
  const FREE_REG = { ...PAID_REG, payment_status: "free", final_price: 0, base_price: 0 };

  it("cancels the category with no refund request, since nothing was paid", async () => {
    const db = fakeDb({
      participant: { id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: null },
      registration: FREE_REG,
      category: SOLO_CAT,
      siblings: [{ id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: null }],
    });
    const out = await cancelRunnerCategory(db as any, { participantId: "p-asha", reason: "unreadable", actorEmail: "v@x" });
    expect(out).toMatchObject({ status: "cancelled", runners: 1, refundPaise: 0, refundRequestId: null, free: true });
    expect(db.writes.some(w => w.table === "it_run_refund_requests")).toBe(false);
    expect(db.writes.some(w => w.table === "it_run_participants" && w.op === "update")).toBe(true);
    expect(db.rpcs).toEqual([{ name: "itr_release_capacity", args: { p_category_id: "cat-10k", p_count: 1 } }]);
  });

  it("an unpaid registration (not free, not paid) is still refused and nothing is cancelled", async () => {
    const db = fakeDb({
      participant: { id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: null },
      registration: { ...PAID_REG, payment_status: "pending", final_price: 2398 },
      category: SOLO_CAT,
      siblings: [{ id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: null }],
    });
    const out = await cancelRunnerCategory(db as any, { participantId: "p-asha", reason: "x", actorEmail: "v@x" });
    expect(out.status).toBe("not_paid");
    expect(db.writes).toEqual([]);
  });
});

describe("the 50% refund for a runner who goes without a BIB", () => {
  it("refunds 50% of the runner's paid share, not the whole booking", () => {
    // 10K Timed Run at Rs. 999 in a Rs. 2,398 booking, no discount: 50% of Rs. 999 is Rs. 499.50
    expect(categoryRefundPaise({ lineBaseRupees: 999, bookingBaseRupees: 2398, bookingDiscountRupees: 0, percent: 50 })).toBe(49950);
  });

  it("is taken from the discounted amount actually paid", () => {
    // Rs. 240 discount over Rs. 2,398: the 999 line carries Rs. 99.98 of it, so Rs. 899.02 is paid, and 50% of that
    expect(categoryRefundPaise({ lineBaseRupees: 999, bookingBaseRupees: 2398, bookingDiscountRupees: 240, percent: 50 })).toBe(44951);
  });

  it("the no-BIB route and its rules are in place", () => {
    const fs2 = require("fs") as typeof import("fs");
    const route = fs2.readFileSync(require("path").join(__dirname, "../../app/api/it-run/admin/bib-desk/no-bib-cancel/route.ts"), "utf8");
    expect(route).toMatch(/percent,\s*\}\);/);
    expect(route).toMatch(/noBibRefundPercent\(/);
    expect(route).toMatch(/BIB_COLLECTED/);
    expect(route).toMatch(/ALREADY_VERIFIED/);
  });
});
