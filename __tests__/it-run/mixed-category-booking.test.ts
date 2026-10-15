/**
 * One booking whose participants are in different categories of the same event: one registration code, one total,
 * each participant stored with their own category, seats reserved per category, and early bird per category.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({
  requireRole: jest.fn(),
  getClientIp: () => "203.0.113.30",
  generateRegistrationCode: () => "ITR-TEST",
  signItRunQR: () => "qr",
  itRunActionKey: () => Buffer.alloc(32, 7),
}));
jest.mock("@/lib/rate-limit", () => ({
  checkAndRecordEndpointLimit: jest.fn().mockResolvedValue({ limited: false, retryAfter: 0 }),
  getClientIp: () => "203.0.113.30",
}));
jest.mock("@/lib/it-run-email", () => ({
  sendItRunConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  sendItRunPaymentReceivedEmail: jest.fn().mockResolvedValue(undefined),
  sendItRunBibInviteEmail: jest.fn().mockResolvedValue(undefined),
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { POST } from "@/app/api/it-run/register/route";

const mockDb = getSupabaseServer as jest.Mock;

const EVENT = "11111111-1111-4111-8111-111111111111";
const OTHER_EVENT = "99999999-9999-4999-8999-999999999999";
const CAT_SOLO = { id: "cat-10k", event_id: EVENT, name: "10K Timed Run", category_type: "solo", price_rupees: 999, max_participants: null, is_active: true };
const CAT_DUO = { id: "cat-duo", event_id: EVENT, name: "5K Duo Challenge", category_type: "duo", price_rupees: 1399, max_participants: null, is_active: true };
const CAT_KID = { id: "cat-kid", event_id: EVENT, name: "Parent & Child Duo", category_type: "kid", price_rupees: 999, max_participants: null, is_active: true };
const CAT_OTHER = { id: "cat-other", event_id: OTHER_EVENT, name: "Other event", category_type: "solo", price_rupees: 500, max_participants: null, is_active: true };
const CAT_OFF = { id: "cat-off", event_id: EVENT, name: "Closed", category_type: "solo", price_rupees: 500, max_participants: null, is_active: false };
const OFFER_DUO = "33333333-3333-4333-8333-333333333333";

function offer(over: Record<string, unknown> = {}) {
  return {
    id: OFFER_DUO, category_id: CAT_DUO.id, name: "Early Bird", discount_type: "percent", discount_value: 10,
    starts_at: "2020-01-01T00:00:00Z", ends_at: "2030-01-01T00:00:00Z", status: "active",
    redemption_limit: null, redemptions_used: 0, min_payable_rupees: 0, ...over,
  };
}

function fake(opts: { categories?: any[]; offers?: any[]; reserve?: string; claimResult?: boolean } = {}) {
  const categories = opts.categories ?? [CAT_SOLO, CAT_DUO, CAT_KID, CAT_OTHER, CAT_OFF];
  const inserts: Array<{ table: string; payload: any }> = [];
  const rpcs: Array<{ name: string; args: any }> = [];
  return {
    inserts, rpcs,
    from(table: string) {
      const b: any = { op: "select", filterIn: null as string[] | null };
      b.select = () => b; b.eq = () => b; b.lte = () => b; b.gt = () => b; b.returns = () => b;
      b.in = (_col: string, values: string[]) => { b.filterIn = values; return b; };
      b.insert = (payload: any) => { b.op = "insert"; b.payload = payload; inserts.push({ table, payload }); return b; };
      b.update = () => { b.op = "update"; return b; };
      b.delete = () => { b.op = "delete"; return b; };
      b.single = () => Promise.resolve(result());
      b.maybeSingle = () => Promise.resolve(result());
      b.then = (res: any, rej?: any) => Promise.resolve(result()).then(res, rej);
      function result(): any {
        if (b.op === "insert" && table === "it_run_registrations") return { data: { id: "reg-1" }, error: null };
        if (b.op === "insert" && table === "it_run_participants") {
          return { data: b.payload.map((_: unknown, i: number) => ({ id: `p-${i + 1}` })), error: null };
        }
        if (b.op !== "select") return { data: null, error: null };
        if (table === "it_run_categories") {
          return { data: categories.filter(c => !b.filterIn || b.filterIn.includes(c.id)), error: null };
        }
        if (table === "it_run_events") return { data: { registration_closes_at: null, event_date: "2026-08-17" }, error: null };
        if (table === "it_run_early_bird_offers") return { data: opts.offers ?? [], error: null };
        return { data: [], error: null };
      }
      return b;
    },
    rpc(name: string, args: any) {
      rpcs.push({ name, args });
      if (name === "itr_reserve_capacity_multi") return Promise.resolve({ data: opts.reserve ?? "confirmed", error: null });
      if (name === "itr_early_bird_claim") return Promise.resolve({ data: opts.claimResult ?? true, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  };
}

function adult(categoryId: string, over: Record<string, unknown> = {}) {
  return {
    categoryId, type: "solo", firstName: "Asha", lastName: "Rao", bibName: "ASHA RAO", gender: "F",
    dob: "1990-05-10", email: "asha@example.com", mobile: "9876543210", bloodGroup: "O+",
    emergencyName: "Ravi", emergencyPhone: "9123456789", companyName: "Acme", employeeId: "E1",
    companyIdUrl: "1760000000000-doc1.jpg", tshirtSize: "M", medicalConditions: "", foodPreference: "veg",
    ...over,
  };
}

function child(categoryId: string, over: Record<string, unknown> = {}) {
  return adult(categoryId, {
    firstName: "Kiran", lastName: "Rao", bibName: "KIRAN RAO", gender: "M", dob: "2018-03-01",
    email: "", mobile: "9876543210", emergencyName: "", emergencyPhone: "", companyName: "", employeeId: "",
    companyIdUrl: "", tshirtSize: "9-10Y", ...over,
  });
}

function post(db: any, body: unknown) {
  mockDb.mockReturnValue(db);
  return POST(new NextRequest("http://t/api/it-run/register", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("one booking, several categories", () => {
  it("creates one registration for the whole booking, priced per category, with each participant's category", async () => {
    const db = fake();
    const res = await post(db, {
      couponId: null,
      participants: [adult(CAT_SOLO.id), adult(CAT_DUO.id, { firstName: "Bala" }), adult(CAT_DUO.id, { firstName: "Chitra" })],
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.registrationCode).toBe("ITR-TEST");
    expect(json.participantIds).toEqual(["p-1", "p-2", "p-3"]);

    const reg = db.inserts.find(i => i.table === "it_run_registrations")!.payload;
    expect(reg.participant_count).toBe(3);
    expect(reg.base_price).toBe(999 + 1399);
    expect(reg.final_price).toBe(999 + 1399);
    expect(reg.category_id).toBe(CAT_SOLO.id); // the booking's first category

    const parts = db.inserts.find(i => i.table === "it_run_participants")!.payload;
    expect(parts.map((p: any) => p.category_id)).toEqual([CAT_SOLO.id, CAT_DUO.id, CAT_DUO.id]);
  });

  it("reserves each category's seats in one call, with one line per category", async () => {
    const db = fake();
    await post(db, {
      couponId: null,
      participants: [adult(CAT_SOLO.id), adult(CAT_DUO.id, { firstName: "Bala" }), adult(CAT_DUO.id, { firstName: "Chitra" })],
    });
    const reserve = db.rpcs.filter(r => r.name === "itr_reserve_capacity_multi");
    expect(reserve).toHaveLength(1);
    expect(reserve[0].args.p_lines).toEqual([
      { category_id: CAT_SOLO.id, count: 1 },
      { category_id: CAT_DUO.id, count: 2 },
    ]);
  });

  it("pays each pair once: two pairs in two categories are four runners for two teams", async () => {
    const db = fake();
    const res = await post(db, {
      couponId: null,
      participants: [
        adult(CAT_KID.id, { firstName: "Parent" }),
        child(CAT_KID.id),
        adult(CAT_DUO.id, { firstName: "Bala" }),
        adult(CAT_DUO.id, { firstName: "Chitra" }),
      ],
    });
    expect(res.status).toBe(200);
    const reg = db.inserts.find(i => i.table === "it_run_registrations")!.payload;
    expect(reg.participant_count).toBe(4);
    expect(reg.final_price).toBe(999 + 1399);
  });

  it("refuses a category with an odd number of people, and writes nothing", async () => {
    const db = fake();
    const res = await post(db, {
      couponId: null,
      participants: [adult(CAT_SOLO.id), adult(CAT_DUO.id, { firstName: "Bala" })],
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("PARTICIPANT_COUNT");
    expect(db.inserts).toEqual([]);
    expect(db.rpcs.some(r => r.name === "itr_reserve_capacity_multi")).toBe(false);
  });

  it("refuses a category from another event, and writes nothing", async () => {
    const db = fake();
    const res = await post(db, { couponId: null, participants: [adult(CAT_SOLO.id), adult(CAT_OTHER.id, { firstName: "Bala" })] });
    expect(res.status).toBe(400);
    expect(db.inserts).toEqual([]);
  });

  it("refuses an inactive category, and writes nothing", async () => {
    const db = fake();
    const res = await post(db, { couponId: null, participants: [adult(CAT_SOLO.id), adult(CAT_OFF.id, { firstName: "Bala" })] });
    expect(res.status).toBe(404);
    expect(db.inserts).toEqual([]);
  });

  it("refuses a category the server does not know, and writes nothing", async () => {
    const db = fake();
    const res = await post(db, { couponId: null, participants: [adult(CAT_SOLO.id), adult("not-a-category", { firstName: "Bala" })] });
    expect(res.status).toBe(404);
    expect(db.inserts).toEqual([]);
  });

  it("applies the early bird to its own category's line only", async () => {
    const db = fake({ offers: [offer()] });
    const res = await post(db, {
      couponId: null,
      participants: [adult(CAT_SOLO.id), adult(CAT_DUO.id, { firstName: "Bala" }), adult(CAT_DUO.id, { firstName: "Chitra" })],
    });
    expect(res.status).toBe(200);
    const reg = db.inserts.find(i => i.table === "it_run_registrations")!.payload;
    expect(reg.discount_amount).toBeGreaterThan(0);
    expect(reg.final_price).toBe(999 + 1399 - reg.discount_amount);
    expect(reg.early_bird_offer_id).toBe(OFFER_DUO);
    expect(db.rpcs.filter(r => r.name === "itr_early_bird_claim").map(r => r.args)).toEqual([{ p_offer_id: OFFER_DUO }]);
  });

  it("refuses a coupon together with an early bird in the booking, and writes nothing", async () => {
    const db = fake({ offers: [offer()] });
    const res = await post(db, {
      couponId: "coupon-1",
      participants: [adult(CAT_SOLO.id), adult(CAT_DUO.id, { firstName: "Bala" }), adult(CAT_DUO.id, { firstName: "Chitra" })],
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("EARLY_BIRD_NO_COUPON");
    expect(db.inserts).toEqual([]);
    expect(db.rpcs.some(r => r.name === "itr_early_bird_claim")).toBe(false);
  });

  it("gives back early bird places and writes nothing when a category is full", async () => {
    const db = fake({ offers: [offer()], reserve: "full" });
    const res = await post(db, {
      couponId: null,
      participants: [adult(CAT_SOLO.id), adult(CAT_DUO.id, { firstName: "Bala" }), adult(CAT_DUO.id, { firstName: "Chitra" })],
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CATEGORY_FULL");
    expect(db.inserts).toEqual([]);
    expect(db.rpcs.filter(r => r.name === "itr_early_bird_release").map(r => r.args)).toEqual([{ p_offer_id: OFFER_DUO }]);
  });

  it("keeps the one-category booking working exactly as before", async () => {
    const db = fake();
    const res = await post(db, {
      couponId: null,
      categoryId: CAT_SOLO.id,
      participants: [adult("", { firstName: "Asha" }), adult("", { firstName: "Bala" })],
    });
    expect(res.status).toBe(200);
    const reg = db.inserts.find(i => i.table === "it_run_registrations")!.payload;
    expect(reg.category_id).toBe(CAT_SOLO.id);
    expect(reg.final_price).toBe(999 * 2);
    const parts = db.inserts.find(i => i.table === "it_run_participants")!.payload;
    expect(parts.every((p: any) => p.category_id === CAT_SOLO.id)).toBe(true);
  });
});
