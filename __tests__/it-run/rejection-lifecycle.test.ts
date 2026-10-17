/**
 * A rejected ID cancels the runner's category and records one refund request. When no runner is left in the booking,
 * the booking itself is cancelled, so every surface reads the same state. The refund is executed later, separately.
 *
 * The fake database here is stateful for participants: a cancelled runner stops appearing in later reads, as it does in
 * Postgres, so the "is anyone left" check is tested against the same state the route sees.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake database is intentionally loosely typed */

import fs from "fs";
import path from "path";
import { cancelRunnerCategory } from "@/lib/it-run-category-cancel";
import { buildCategoryCancelledEmail } from "@/lib/it-run-category-cancel-email";
import { buildMyRegistrations, paymentStatusView } from "@/lib/it-run-my-registrations";

interface Row { [key: string]: any }

function fakeDb(opts: {
  participant?: Row | null;
  registration?: Row | null;
  category?: Row | null;
  siblings?: Row[];
  cancelledIds?: string[];
  refundConflict?: boolean;
  registrationUpdateError?: boolean;
}) {
  const writes: Array<{ table: string; op: string; payload?: any; filters?: any }> = [];
  const rpcs: Array<{ name: string; args: any }> = [];
  const cancelled = new Set<string>(opts.cancelledIds ?? []);
  const tables: Record<string, any> = {
    it_run_participants: opts.participant ?? null,
    it_run_registrations: opts.registration ?? null,
    it_run_categories: opts.category ?? null,
  };
  return {
    writes, rpcs,
    from(table: string) {
      const b: any = { op: "select", filters: {} };
      b.select = () => b;
      b.eq = (k: string, v: unknown) => { b.filters[k] = v; return b; };
      b.is = (k: string, v: unknown) => { b.filters[k] = v; return b; };
      b.in = (k: string, v: unknown) => { b.filters[k] = v; return b; };
      b.neq = (k: string, v: unknown) => { b.filters[`neq:${k}`] = v; return b; };
      b.returns = () => b;
      b.insert = (payload: any) => { b.op = "insert"; b.payload = payload; writes.push({ table, op: "insert", payload }); return b; };
      b.update = (payload: any) => { b.op = "update"; b.payload = payload; return b; };
      b.maybeSingle = () => {
        if (b.op === "insert") {
          if (table === "it_run_refund_requests" && opts.refundConflict) return Promise.resolve({ data: null, error: { code: "23505" } });
          return Promise.resolve({ data: { id: "rr-1" }, error: null });
        }
        return Promise.resolve({ data: tables[table] ?? null, error: null });
      };
      b.then = (res: any, rej?: any) => {
        if (b.op === "update") {
          writes.push({ table, op: "update", payload: b.payload, filters: b.filters });
          if (table === "it_run_participants") for (const id of b.filters.id ?? []) cancelled.add(id);
          const error = table === "it_run_registrations" && opts.registrationUpdateError ? { message: "write failed" } : null;
          return Promise.resolve({ data: [{ id: "x" }], error }).then(res, rej);
        }
        const data = table === "it_run_participants" ? (opts.siblings ?? []).filter(p => !cancelled.has(p.id)) : [];
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
  base_price: 2398, discount_amount: 0, registration_status: "pending_verification",
};
const SOLO_CAT = { id: "cat-10k", name: "10K Timed Run", category_type: "solo", price_rupees: 999 };
const DUO_CAT = { id: "cat-duo", name: "5K Duo Challenge", category_type: "duo", price_rupees: 1399 };
const SOLO_ONLY = [{ id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: null }];

function registrationWrites(db: ReturnType<typeof fakeDb>) {
  return db.writes.filter(w => w.table === "it_run_registrations" && w.op === "update");
}

describe("a rejected ID on a solo paid booking", () => {
  it("cancels the booking as a registration and records the refund request", async () => {
    const db = fakeDb({
      participant: { id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: null },
      registration: PAID_REG,
      category: SOLO_CAT,
      siblings: SOLO_ONLY,
    });
    const out = await cancelRunnerCategory(db as any, { participantId: "p-asha", reason: "unreadable", actorEmail: "v@x" });
    expect(out).toMatchObject({ status: "cancelled", runners: 1, refundPaise: 89910 });

    const regUpdate = registrationWrites(db);
    expect(regUpdate).toHaveLength(1);
    // Only this booking, and only if it is not already cancelled
    expect(regUpdate[0].filters).toEqual({ id: "reg-1", "neq:registration_status": "cancelled" });
    expect(regUpdate[0].payload).toMatchObject({ registration_status: "cancelled", cancelled_reason: "All runners cancelled after ID verification" });
    expect(regUpdate[0].payload.cancelled_at).toEqual(expect.any(String));

    // The refund is still only a request; nothing is paid by this step
    const request = db.writes.find(w => w.table === "it_run_refund_requests")!;
    expect(request.payload).toMatchObject({ status: "requested", request_kind: "category_cancel", requested_amount_paise: 89910 });
  });

  it("a second rejection of the same runner cancels nothing and records no second refund", async () => {
    const first = fakeDb({
      participant: { id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: null },
      registration: PAID_REG,
      category: SOLO_CAT,
      siblings: SOLO_ONLY,
    });
    await cancelRunnerCategory(first as any, { participantId: "p-asha", reason: "x", actorEmail: "v@x" });

    // The runner is now cancelled in the database
    const again = fakeDb({
      participant: { id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: "2026-10-17T04:30:08Z" },
      registration: { ...PAID_REG, registration_status: "cancelled" },
      category: SOLO_CAT,
      siblings: SOLO_ONLY,
      cancelledIds: ["p-asha"],
    });
    const out = await cancelRunnerCategory(again as any, { participantId: "p-asha", reason: "x", actorEmail: "v@x" });
    expect(out.status).toBe("already_cancelled");
    expect(again.writes.some(w => w.table === "it_run_refund_requests")).toBe(false);
    expect(again.rpcs).toEqual([]);
  });

  it("when the refund request is refused as a duplicate, nothing is cancelled and the booking is untouched", async () => {
    const db = fakeDb({
      participant: { id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: null },
      registration: PAID_REG,
      category: SOLO_CAT,
      siblings: SOLO_ONLY,
      refundConflict: true,
    });
    const out = await cancelRunnerCategory(db as any, { participantId: "p-asha", reason: "x", actorEmail: "v@x" });
    expect(out.status).toBe("refund_already_open");
    expect(db.writes.some(w => w.table === "it_run_participants")).toBe(false);
    expect(registrationWrites(db)).toHaveLength(0);
  });

  it("when the booking cannot be marked cancelled, the call reports an error so no email is sent", async () => {
    const db = fakeDb({
      participant: { id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: null },
      registration: PAID_REG,
      category: SOLO_CAT,
      siblings: SOLO_ONLY,
      registrationUpdateError: true,
    });
    const out = await cancelRunnerCategory(db as any, { participantId: "p-asha", reason: "x", actorEmail: "v@x" });
    expect(out.status).toBe("error");
    expect(out).toMatchObject({ message: expect.stringContaining("could not be marked cancelled") });
  });

  it("a retry after the runner was cancelled but the booking was not marked finishes the booking", async () => {
    const db = fakeDb({
      participant: { id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: "2026-10-17T04:30:08Z" },
      registration: PAID_REG,
      category: SOLO_CAT,
      siblings: SOLO_ONLY,
      cancelledIds: ["p-asha"],
    });
    const out = await cancelRunnerCategory(db as any, { participantId: "p-asha", reason: "x", actorEmail: "v@x" });
    expect(out.status).toBe("already_cancelled");
    expect(registrationWrites(db)).toHaveLength(1);
    expect(db.writes.some(w => w.table === "it_run_refund_requests")).toBe(false);
  });
});

describe("a rejected ID on a booking that keeps other runners", () => {
  it("leaves the booking active when another category still has runners", async () => {
    const siblings = [
      { id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: null },
      { id: "p-bala", registration_id: "reg-1", category_id: "cat-duo", cancelled_at: null },
      { id: "p-chitra", registration_id: "reg-1", category_id: "cat-duo", cancelled_at: null },
    ];
    const db = fakeDb({
      participant: { id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: null },
      registration: PAID_REG,
      category: SOLO_CAT,
      siblings,
    });
    const out = await cancelRunnerCategory(db as any, { participantId: "p-asha", reason: "x", actorEmail: "v@x" });
    expect(out.status).toBe("cancelled");
    expect(registrationWrites(db)).toHaveLength(0);
  });
});

describe("a rejected ID on a free booking", () => {
  it("cancels the booking as a registration, with no refund request", async () => {
    const db = fakeDb({
      participant: { id: "p-asha", registration_id: "reg-1", category_id: "cat-10k", cancelled_at: null },
      registration: { ...PAID_REG, payment_status: "free", final_price: 0, base_price: 0 },
      category: SOLO_CAT,
      siblings: SOLO_ONLY,
    });
    const out = await cancelRunnerCategory(db as any, { participantId: "p-asha", reason: "x", actorEmail: "v@x" });
    expect(out).toMatchObject({ status: "cancelled", free: true, refundRequestId: null });
    expect(registrationWrites(db)).toHaveLength(1);
    expect(db.writes.some(w => w.table === "it_run_refund_requests")).toBe(false);
  });
});

describe("the email for a rejected ID", () => {
  it("says the refund has been requested, not that it will be paid automatically", () => {
    const html = buildCategoryCancelledEmail({
      firstName: "Asha", eventTitle: "The IT Run Sprint-2", categoryName: "5K Fun Run",
      refundPaise: 540, refundPercent: 90, otherRunnersKept: false,
    });
    expect(html).toContain("has been requested");
    expect(html).toContain("once our team has processed it");
    expect(html).not.toContain("will be processed to your original payment method");
    expect(html).toContain("Rs. 5.4");
  });

  it("a free registration says no payment was taken", () => {
    const html = buildCategoryCancelledEmail({
      firstName: "Asha", eventTitle: "The IT Run Sprint-2", categoryName: "5K Fun Run",
      refundPaise: 0, refundPercent: 90, otherRunnersKept: false, free: true,
    });
    expect(html).toContain("no payment was taken");
    expect(html).not.toContain("has been requested");
  });
});

describe("what a participant sees for a cancelled booking", () => {
  const SOLO_REG_ROW = {
    id: "reg-1", registration_code: "ITRUN2-TEST", payment_status: "paid", registration_status: "cancelled",
    final_price: 6, base_price: 649, discount_amount: 643, early_bird_offer_id: null, participant_count: 1,
    created_at: "2026-10-17T04:29:09Z",
    category: { name: "5K Fun Run", distance_km: 5, color: "#22c55e", category_type: "solo" },
    event: { title: "The IT Run Sprint-2", event_date: "2027-02-07" },
  };

  it("My Registrations shows Cancelled, with no runner listed as active", () => {
    const [reg] = buildMyRegistrations([SOLO_REG_ROW as any], [], []);
    expect(paymentStatusView(reg.payment_status, reg.registration_status).label).toBe("Cancelled");
    expect(reg.participants).toEqual([]);
    expect(reg.actions.canChangeCategory).toBe(false);
  });

  it("a paid booking still waiting for ID checks shows Awaiting ID verification, not Confirmed", () => {
    expect(paymentStatusView("paid", "pending_verification").label).toBe("Awaiting ID verification");
    expect(paymentStatusView("paid", "active").label).toBe("Confirmed");
  });
});

describe("the surfaces that read the cancelled state", () => {
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

  it("the dashboard shows Cancelled and offers no QR code for a cancelled booking", () => {
    const page = read("app/it-run/dashboard/[code]/page.tsx");
    expect(page).toMatch(/const cancelled = reg\.registration_status === "cancelled";/);
    expect(page).toMatch(/status=\{cancelled \? "cancelled" : reg\.payment_status\}/);
    expect(page).toMatch(/paid && !cancelled && reg\.participant_count === 1/);
    expect(page).toMatch(/paid && !cancelled && reg\.participant_count > 1/);
    expect(page).toMatch(/This registration has been cancelled/);
  });

  it("staff lookup by registration code prefers an active runner over a cancelled one", () => {
    const route = read("app/api/it-run/staff/participant/lookup/route.ts");
    expect(route).toMatch(/order\("cancelled_at", \{ ascending: true, nullsFirst: true \}\)/);
  });
});
