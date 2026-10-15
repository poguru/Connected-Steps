/**
 * The registration API's two guards: a restricted discount code must cover every category in the booking, and the
 * same runners cannot be registered again while their first booking waits for payment.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake database is intentionally loosely typed */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({
  requireRole: jest.fn(),
  getClientIp: () => "203.0.113.40",
  generateRegistrationCode: () => "ITR-TEST",
  signItRunQR: () => "qr",
  itRunActionKey: () => Buffer.alloc(32, 7),
}));
jest.mock("@/lib/rate-limit", () => ({
  checkAndRecordEndpointLimit: jest.fn().mockResolvedValue({ limited: false, retryAfter: 0 }),
  getClientIp: () => "203.0.113.40",
}));
jest.mock("@/lib/it-run-email", () => ({
  sendItRunConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  sendItRunPaymentReceivedEmail: jest.fn().mockResolvedValue(undefined),
  sendItRunBibInviteEmail: jest.fn().mockResolvedValue(undefined),
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { POST } from "@/app/api/it-run/register/route";
import {
  couponUncoveredCategories, isDuplicateOpenRegistration, DUPLICATE_WINDOW_MS,
} from "@/lib/it-run-registration-guards";

const EVENT = "11111111-1111-4111-8111-111111111111";
const SOLO = { id: "cat-10k", event_id: EVENT, name: "10K Timed Run", category_type: "solo", price_rupees: 999, max_participants: null, is_active: true };
const DUO = { id: "cat-duo", event_id: EVENT, name: "5K Duo Challenge", category_type: "duo", price_rupees: 1399, max_participants: null, is_active: true };

describe("couponUncoveredCategories", () => {
  it("covers everything when the code has no category list", () => {
    expect(couponUncoveredCategories(null, ["a", "b"])).toEqual([]);
    expect(couponUncoveredCategories([], ["a", "b"])).toEqual([]);
  });

  it("lists the booking's categories the code does not cover", () => {
    expect(couponUncoveredCategories(["a"], ["a", "b"])).toEqual(["b"]);
  });

  it("covers a booking whose categories are all on the list", () => {
    expect(couponUncoveredCategories(["a", "b"], ["a", "b", "a"])).toEqual([]);
  });
});

describe("isDuplicateOpenRegistration", () => {
  it("matches the same runners, whatever order they were entered in", () => {
    expect(isDuplicateOpenRegistration(["9876543210", "9876501234"], [["9876501234", "9876543210"]])).toBe(true);
  });

  it("does not match a different set of runners, even when one is the same", () => {
    expect(isDuplicateOpenRegistration(["9876543210", "9876501234"], [["9876543210"]])).toBe(false);
    expect(isDuplicateOpenRegistration(["9876543210"], [["9876543210", "9876501234"]])).toBe(false);
  });

  it("is false when there is nothing to compare with", () => {
    expect(isDuplicateOpenRegistration(["9876543210"], [])).toBe(false);
    expect(isDuplicateOpenRegistration([], [[]])).toBe(false);
  });

  it("uses a 15-minute window, the same as the payment hold", () => {
    expect(DUPLICATE_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});

// ── The route ──────────────────────────────────────────────────────────────────

function fake(opts: {
  openRegs?: Array<{ id: string; mobiles: string[] }>;
  coupon?: { applicable_category_ids: string[] | null } | null;
  couponDiscount?: number | null;
  claim?: "granted" | "refused" | "error" | "missing";
} = {}) {
  const inserts: string[] = [];
  const rpcs: Array<{ name: string; args: any }> = [];
  return {
    inserts, rpcs,
    from(table: string) {
      const b: any = { op: "select", filterIn: null as string[] | null };
      b.select = () => b; b.eq = () => b; b.gt = () => b; b.lte = () => b; b.returns = () => b;
      b.in = (_c: string, values: string[]) => { b.filterIn = values; return b; };
      b.insert = (payload: any) => { b.op = "insert"; inserts.push(table); b.payload = payload; return b; };
      b.update = () => { b.op = "update"; return b; };
      b.single = () => Promise.resolve(result(true));
      b.maybeSingle = () => Promise.resolve(result(true));
      b.then = (res: any, rej?: any) => Promise.resolve(result(false)).then(res, rej);
      function result(single: boolean): any {
        if (b.op === "insert" && table === "it_run_registrations") return { data: { id: "reg-1" }, error: null };
        if (b.op === "insert" && table === "it_run_participants") return { data: b.payload.map((_: unknown, i: number) => ({ id: `p-${i + 1}` })), error: null };
        if (b.op !== "select") return { data: null, error: null };
        if (table === "it_run_categories") return { data: [SOLO, DUO].filter(c => !b.filterIn || b.filterIn.includes(c.id)), error: null };
        if (table === "it_run_events") return { data: { registration_closes_at: null, event_date: "2026-08-17" }, error: null };
        if (table === "it_run_early_bird_offers") return { data: [], error: null };
        if (table === "it_run_registrations") return { data: (opts.openRegs ?? []).map(r => ({ id: r.id })), error: null };
        if (table === "it_run_participants") {
          const rows = (opts.openRegs ?? []).flatMap(r => r.mobiles.map(m => ({ registration_id: r.id, mobile: m })));
          return { data: rows, error: null };
        }
        if (table === "it_run_coupons") return { data: single ? (opts.coupon ?? null) : [], error: null };
        return { data: [], error: null };
      }
      return b;
    },
    rpc(name: string, args: any) {
      rpcs.push({ name, args });
      if (name === "itr_reserve_capacity_multi") return Promise.resolve({ data: "confirmed", error: null });
      if (name === "itr_use_coupon") return Promise.resolve({ data: opts.couponDiscount ?? null, error: null });
      if (name === "itr_claim_registration") {
        if (opts.claim === "missing") return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
        if (opts.claim === "error") return Promise.resolve({ data: null, error: { code: "XX000", message: "boom" } });
        return Promise.resolve({ data: opts.claim !== "refused", error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
}

function runner(categoryId: string, mobile: string, first: string) {
  return {
    categoryId, type: "solo", firstName: first, lastName: "Rao", bibName: first.toUpperCase(), gender: "F",
    dob: "1990-05-10", email: "lead@example.com", mobile, bloodGroup: "O+",
    emergencyName: "Ravi", emergencyPhone: "9123456789", companyName: "Acme", employeeId: "E1",
    companyIdUrl: "1760000000000-doc1.jpg", tshirtSize: "M", medicalConditions: "", foodPreference: "veg",
  };
}

function post(db: any, body: unknown) {
  (getSupabaseServer as jest.Mock).mockReturnValue(db);
  return POST(new NextRequest("http://t/api/it-run/register", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("register route: a restricted discount code", () => {
  const body = (couponId: string) => ({
    couponId,
    participants: [runner(SOLO.id, "9876543210", "Asha"), runner(DUO.id, "9876501234", "Bala"), runner(DUO.id, "9876512345", "Chitra")],
  });

  it("is refused for a booking with a category the code does not cover, and nothing is held", async () => {
    const db = fake({ coupon: { applicable_category_ids: [SOLO.id] }, couponDiscount: 100 });
    const res = await post(db, body("coupon-1"));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("COUPON_CATEGORY");
    expect(db.rpcs.some(r => r.name === "itr_use_coupon")).toBe(false);
    expect(db.rpcs.some(r => r.name === "itr_reserve_capacity_multi")).toBe(false);
    expect(db.inserts).toEqual([]);
  });

  it("is accepted when the code covers every category in the booking", async () => {
    const db = fake({ coupon: { applicable_category_ids: [SOLO.id, DUO.id] }, couponDiscount: 100 });
    const res = await post(db, body("coupon-1"));
    expect(res.status).toBe(200);
    expect(db.rpcs.some(r => r.name === "itr_use_coupon")).toBe(true);
  });

  it("is accepted when the code has no category list", async () => {
    const db = fake({ coupon: { applicable_category_ids: null }, couponDiscount: 100 });
    expect((await post(db, body("coupon-1"))).status).toBe(200);
  });
});

describe("register route: the same runners again while they wait for payment", () => {
  const body = {
    couponId: null,
    participants: [runner(SOLO.id, "9876543210", "Asha"), runner(SOLO.id, "9876501234", "Bala")],
  };

  it("is refused when the database says a fresh claim already holds these runners, and nothing is written", async () => {
    const db = fake({ claim: "refused" });
    const res = await post(db, body);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("DUPLICATE_REGISTRATION");
    expect(db.inserts).toEqual([]);
    expect(db.rpcs.some(r => r.name === "itr_reserve_capacity_multi")).toBe(false);
  });

  it("falls back to the read-based check when the claim function is not in the database yet", async () => {
    const refused = fake({ claim: "missing", openRegs: [{ id: "old-reg", mobiles: ["9876501234", "9876543210"] }] });
    const res = await post(refused, body);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("DUPLICATE_REGISTRATION");
    expect(refused.inserts).toEqual([]);
  });

  it("stops and writes nothing when the claim itself fails", async () => {
    const db = fake({ claim: "error" });
    const res = await post(db, body);
    expect(res.status).toBe(500);
    expect(db.inserts).toEqual([]);
  });

  it("gives its claim back when the registration is refused after taking it", async () => {
    const db = fake({ coupon: { applicable_category_ids: [SOLO.id] }, couponDiscount: 100 });
    const res = await post(db, {
      couponId: "coupon-1",
      participants: [runner(SOLO.id, "9876543210", "Asha"), runner(DUO.id, "9876501234", "Bala"), runner(DUO.id, "9876512345", "Chitra")],
    });
    expect(res.status).toBe(409);
    expect(db.rpcs.some(r => r.name === "itr_release_claim")).toBe(true);
  });

  it("is allowed when the open booking has different runners", async () => {
    const db = fake({ openRegs: [{ id: "old-reg", mobiles: ["9876543210"] }] });
    expect((await post(db, body)).status).toBe(200);
  });

  it("is allowed when there is no open booking", async () => {
    expect((await post(fake(), body)).status).toBe(200);
  });
});
