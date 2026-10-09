/**
 * Early bird in the registration API: the offer is applied on the server, its place is claimed atomically,
 * and it is never combined with a coupon. Refusals happen before any registration is written.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({
  requireRole: jest.fn(),
  getClientIp: () => "203.0.113.12",
  generateRegistrationCode: () => "ITR-TEST",
  signItRunQR: () => "qr",
}));
jest.mock("@/lib/rate-limit", () => ({
  checkAndRecordEndpointLimit: jest.fn().mockResolvedValue({ limited: false, retryAfter: 0 }),
  getClientIp: () => "203.0.113.12",
}));
jest.mock("@/lib/it-run-email", () => ({
  sendItRunConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  sendItRunBibInviteEmail: jest.fn().mockResolvedValue(undefined),
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";
import { POST as registerPost } from "@/app/api/it-run/register/route";
import { GET as offersGet, PATCH as offersPatch } from "@/app/api/it-run/admin/early-bird/route";

const mockDb = getSupabaseServer as jest.Mock;
const mockRole = requireRole as jest.Mock;

const EVENT = "11111111-1111-4111-8111-111111111111";
const CAT = "22222222-2222-4222-8222-222222222222";
const OFFER = "33333333-3333-4333-8333-333333333333";

function offerRow(over: Record<string, unknown> = {}) {
  return {
    id: OFFER, category_id: CAT, name: "Early Bird", discount_type: "percent", discount_value: 15,
    starts_at: "2026-10-01T00:00:00Z", ends_at: "2027-01-31T23:59:00Z", status: "active",
    redemption_limit: 100, redemptions_used: 0, min_payable_rupees: 0, ...over,
  };
}

function fake(opts: { offers?: any[]; claimResult?: boolean } = {}) {
  const inserts: string[] = [];
  const rpcs: Array<{ name: string; args: any }> = [];
  const db = {
    inserts, rpcs,
    from(table: string) {
      const b: any = { op: "select" };
      b.select = () => b; b.eq = () => b; b.lte = () => b; b.gt = () => b; b.in = () => b; b.is = () => b;
      b.insert = () => { b.op = "insert"; inserts.push(table); return b; };
      b.update = () => { b.op = "update"; return b; };
      b.returns = () => b;
      b.single = () => Promise.resolve(run(true));
      b.maybeSingle = () => Promise.resolve(run(true));
      b.then = (res: any, rej?: any) => Promise.resolve(run(false)).then(res, rej);
      function run(single: boolean): any {
        if (b.op === "insert") return { data: { id: "reg-1", version: 1 }, error: null };
        if (table === "it_run_categories") {
          const cat = { id: CAT, event_id: EVENT, name: "5K Timed", category_type: "solo", price_rupees: 799, max_participants: null, is_active: true };
          return { data: single ? cat : [{ id: CAT, name: "5K Timed", price_rupees: 799, is_active: true }], error: null };
        }
        if (table === "it_run_events") return { data: { registration_closes_at: null, event_date: "2026-08-17" }, error: null };
        if (table === "it_run_early_bird_offers") return { data: single ? (opts.offers ?? [])[0] ?? null : opts.offers ?? [], error: null };
        return { data: [], error: null };
      }
      return b;
    },
    rpc(name: string, args: any) {
      rpcs.push({ name, args });
      if (name === "itr_early_bird_claim") return Promise.resolve({ data: opts.claimResult ?? true, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  };
  return db;
}

function body(couponId: string | null = null) {
  return {
    categoryId: CAT, couponId,
    participants: [{
      type: "solo", firstName: "Asha", lastName: "Rao", bibName: "ASHA RAO", gender: "F",
      dob: "1990-05-10", email: "asha@example.com", mobile: "9876543210", bloodGroup: "O+",
      emergencyName: "Ravi", emergencyPhone: "9123456789", companyName: "Acme", employeeId: "E1",
      companyIdUrl: "", tshirtSize: "M", medicalConditions: "", foodPreference: "veg",
    }],
  };
}

function regReq(b: unknown) {
  return new NextRequest("http://t/api/it-run/register", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
  });
}

beforeEach(() => jest.clearAllMocks());

describe("registration with an early bird offer", () => {
  it("refuses a coupon when an early bird applies, and writes nothing", async () => {
    const db = fake({ offers: [offerRow()] });
    mockDb.mockReturnValue(db);
    const res = await registerPost(regReq(body("coupon-1")));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("EARLY_BIRD_NO_COUPON");
    expect(db.rpcs.some(r => r.name === "itr_early_bird_claim")).toBe(false);
    expect(db.inserts).toEqual([]);
  });

  it("refuses when the last place has just gone, and writes nothing", async () => {
    const db = fake({ offers: [offerRow()], claimResult: false });
    mockDb.mockReturnValue(db);
    const res = await registerPost(regReq(body()));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("EARLY_BIRD_UNAVAILABLE");
    expect(db.inserts).toEqual([]);
  });

  it("claims the place for the offer that applies", async () => {
    const db = fake({ offers: [offerRow()] });
    mockDb.mockReturnValue(db);
    await registerPost(regReq(body()));
    expect(db.rpcs.find(r => r.name === "itr_early_bird_claim")?.args).toEqual({ p_offer_id: OFFER });
  });

  it("ignores an offer outside its window (no claim is attempted)", async () => {
    const db = fake({ offers: [offerRow({ ends_at: "2026-10-02T00:00:00Z" })] });
    mockDb.mockReturnValue(db);
    await registerPost(regReq(body()));
    expect(db.rpcs.some(r => r.name === "itr_early_bird_claim")).toBe(false);
  });
});

// ── Admin ───────────────────────────────────────────────────────────────────────

function adminReq(method: string, b?: unknown) {
  return new NextRequest("http://t/api/it-run/admin/early-bird", {
    method, headers: { "content-type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b),
  });
}

describe("admin early bird endpoints", () => {
  it("refuses everyone who is not an event admin", async () => {
    mockRole.mockReturnValue(null);
    mockDb.mockReturnValue(fake());
    expect((await offersGet(adminReq("GET"))).status).toBe(401);
    expect((await offersPatch(adminReq("PATCH", { id: OFFER, discount_value: 20 }))).status).toBe(401);
  });

  it("refuses an invalid edit with the validation message and writes nothing", async () => {
    mockRole.mockReturnValue({ email: "admin@example.com", role: "event_admin" });
    const db = fake({ offers: [offerRow()] });
    mockDb.mockReturnValue(db);
    const res = await offersPatch(adminReq("PATCH", { id: OFFER, discount_value: 95 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at most 90%/);
    expect(db.inserts).toEqual([]);
  });
});
