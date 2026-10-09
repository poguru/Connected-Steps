/**
 * Participant category change (same-price path) and the refusals for upgrades and downgrades.
 *  - Only the owner of a registration can see or change it.
 *  - Upgrades and downgrades are refused before any capacity or database write.
 *  - A same-price change moves capacity exactly once and keeps the registration ID, code, and QR tokens.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth", () => ({ verifyUserToken: jest.fn(), USER_SESSION_COOKIE: "cs_user_session" }));
jest.mock("@/lib/rate-limit", () => ({ getClientIp: () => "203.0.113.11" }));
jest.mock("@/lib/razorpay-client", () => ({
  getRazorpaySDK: () => ({ orders: { create: jest.fn().mockResolvedValue({ id: "order_test_1" }) } }),
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { GET, POST } from "@/app/api/it-run/registrations/[id]/category/route";

const mockDb = getSupabaseServer as jest.Mock;
const mockUser = verifyUserToken as jest.Mock;

const REG_ID = "aaaaaaaa-1111-4111-8111-111111111111";
const OWNER = "owner@example.com";
const EVENT = "eeeeeeee-5555-4555-8555-555555555555";
const TEN_K = "cat-10k";
const FIVE_K = "cat-5k";      // same price as 10K in this test (also solo)
const PREMIUM = "cat-premium"; // more expensive
const BASIC = "cat-basic";     // cheaper (downgrade)

function reg(over: Record<string, unknown> = {}) {
  return {
    id: REG_ID, event_id: EVENT, registration_code: "ITR-0001", category_id: TEN_K,
    final_price: 799, payment_status: "paid", registration_status: "active",
    participant_count: 1, coupon_id: null, linked_user_email: OWNER, ...over,
  };
}

const CATS = [
  { id: TEN_K, slug: "10k-timed", name: "10K Timed Run", category_type: "solo", price_rupees: 799, distance_km: 10, is_active: true, max_participants: null, current_participants: 3 },
  { id: FIVE_K, slug: "5k-timed", name: "5K Timed Run", category_type: "solo", price_rupees: 799, distance_km: 5, is_active: true, max_participants: 100, current_participants: 10 },
  { id: PREMIUM, slug: "premium", name: "Premium", category_type: "solo", price_rupees: 1299, distance_km: 21, is_active: true, max_participants: null, current_participants: 0 },
  { id: BASIC, slug: "basic", name: "Basic", category_type: "solo", price_rupees: 499, distance_km: 3, is_active: true, max_participants: null, current_participants: 0 },
];

function fakeDb(opts: { reg?: any; reserve?: string; moveSucceeds?: boolean } = {}) {
  const updates: any[] = [];
  const rpcs: Array<{ name: string; args: any }> = [];
  const db = {
    updates, rpcs,
    from(table: string) {
      const b: any = { op: "select", filters: {} as Record<string, unknown> };
      b.select = () => b;
      b.eq = (k: string, v: unknown) => { b.filters[k] = v; return b; };
      b.in = () => b;
      b.returns = () => b;
      b.update = (p: unknown) => { b.op = "update"; updates.push({ table, payload: p, filters: b.filters }); return b; };
      b.insert = () => { b.op = "insert"; return b; };
      b.lt = () => b;
      b.maybeSingle = () => Promise.resolve(run());
      b.then = (res: (v: any) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej);
      function run(): any {
        if (table === "it_run_category_changes") return { data: b.op === "insert" ? { id: "chg1" } : [], error: null };
        if (table === "it_run_registrations") {
          if (b.op === "update") {
            const ok = opts.moveSucceeds !== false;
            return { data: ok ? { id: REG_ID } : null, error: null };
          }
          return { data: opts.reg === undefined ? reg() : opts.reg, error: null };
        }
        if (table === "it_run_categories") {
          if (b.filters.id) return { data: CATS.find(c => c.id === b.filters.id) ?? null, error: null };
          return { data: CATS, error: null };
        }
        return { data: null, error: null };
      }
      return b;
    },
    rpc(name: string, args: any) {
      rpcs.push({ name, args });
      if (name === "itr_reserve_capacity") return Promise.resolve({ data: opts.reserve ?? "confirmed", error: null });
      return Promise.resolve({ data: null, error: null });
    },
  };
  return db;
}

function req(method: string, body?: unknown, signedIn = true) {
  return new NextRequest(`http://t/api/it-run/registrations/${REG_ID}/category`, {
    method,
    headers: { "content-type": "application/json", ...(signedIn ? { cookie: "cs_user_session=s" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: REG_ID }) };

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.mockReturnValue(OWNER);
});

describe("ownership", () => {
  it("requires a signed-in session", async () => {
    mockUser.mockReturnValue(null);
    mockDb.mockReturnValue(fakeDb());
    const res = await GET(req("GET", undefined, false), params);
    expect(res.status).toBe(401);
  });

  it("gives the same 404 for someone else's registration as for a missing one", async () => {
    mockUser.mockReturnValue("someone-else@example.com");
    mockDb.mockReturnValue(fakeDb());
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("NOT_FOUND");
  });

  it("refuses a change on someone else's registration and writes nothing", async () => {
    mockUser.mockReturnValue("someone-else@example.com");
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await POST(req("POST", { categoryId: FIVE_K }), params);
    expect(res.status).toBe(404);
    expect(db.rpcs).toEqual([]);
    expect(db.updates).toEqual([]);
  });
});

describe("options", () => {
  it("lists only same-participant-count categories, with server prices", async () => {
    mockDb.mockReturnValue(fakeDb());
    const body = await (await GET(req("GET"), params)).json();
    expect(body.current.priceRupees).toBe(799);
    const ids = body.options.map((o: any) => o.id);
    expect(ids).toContain(FIVE_K);
    expect(ids).toContain(PREMIUM);
    expect(ids).not.toContain(TEN_K);
  });

  it("marks same-price options as allowed and upgrades as not available online", async () => {
    mockDb.mockReturnValue(fakeDb());
    const body = await (await GET(req("GET"), params)).json();
    expect(body.options.find((o: any) => o.id === FIVE_K)).toMatchObject({ change: "same", allowed: true });
    expect(body.options.find((o: any) => o.id === PREMIUM)).toMatchObject({ change: "upgrade", allowed: true });
    expect(body.options.find((o: any) => o.id === BASIC)).toMatchObject({ change: "downgrade", allowed: false });
  });

  it("blocks changes on unpaid registrations and discounted ones", async () => {
    mockDb.mockReturnValue(fakeDb({ reg: reg({ payment_status: "pending" }) }));
    const body = await (await GET(req("GET"), params)).json();
    expect(body.options.every((o: any) => !o.allowed)).toBe(true);

    mockDb.mockReturnValue(fakeDb({ reg: reg({ coupon_id: "c1" }) }));
    const body2 = await (await GET(req("GET"), params)).json();
    expect(body2.options.every((o: any) => !o.allowed)).toBe(true);
  });
});

describe("POST refusals happen before any write", () => {
  it("refuses a downgrade with a price change and touches no capacity", async () => {
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await POST(req("POST", { categoryId: BASIC }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("PRICE_CHANGE_NOT_SUPPORTED");
    expect(db.rpcs).toEqual([]);
    expect(db.updates).toEqual([]);
  });

  it("an upgrade holds the seat and asks for the exact difference, without moving the registration yet", async () => {
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await POST(req("POST", { categoryId: PREMIUM }), params);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ kind: "payment", changeId: "chg1", orderId: "order_test_1", amount: (1299 - 799) * 100 });
    expect(db.rpcs.filter(r => r.name === "itr_reserve_capacity").map(r => r.args.p_category_id)).toEqual([PREMIUM]);
    // The registration keeps its original category until the payment is verified
    expect(db.updates.some(u => u.table === "it_run_registrations")).toBe(false);
  });

  it("refuses the same category", async () => {
    mockDb.mockReturnValue(fakeDb());
    const res = await POST(req("POST", { categoryId: TEN_K }), params);
    expect(res.status).toBe(400);
  });

  it("refuses a full target category without moving the registration", async () => {
    const db = fakeDb({ reserve: "full" });
    mockDb.mockReturnValue(db);
    const res = await POST(req("POST", { categoryId: FIVE_K }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CATEGORY_FULL");
    expect(db.updates).toEqual([]);
  });
});

describe("a same-price change", () => {
  it("moves the registration once, keeps the ID and QR tokens, and frees the old seat once", async () => {
    const db = fakeDb();
    mockDb.mockReturnValue(db);

    const res = await POST(req("POST", { categoryId: FIVE_K }), params);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.registrationCode).toBe("ITR-0001");

    // Reserve the new category, then release the old one exactly once
    expect(db.rpcs.filter(r => r.name === "itr_reserve_capacity").map(r => r.args.p_category_id)).toEqual([FIVE_K]);
    expect(db.rpcs.filter(r => r.name === "itr_release_capacity")).toEqual([
      { name: "itr_release_capacity", args: { p_category_id: TEN_K, p_count: 1 } },
    ]);

    // Only the registration's category changes; no participant, QR, or payment write
    const writes = db.updates;
    expect(writes).toHaveLength(1);
    expect(writes[0].table).toBe("it_run_registrations");
    expect(writes[0].payload).toEqual({ category_id: FIVE_K });
    expect(writes[0].filters).toMatchObject({ id: REG_ID, category_id: TEN_K, payment_status: "paid" });
  });

  it("releases the seat it reserved if the registration changed underneath it", async () => {
    const db = fakeDb({ moveSucceeds: false });
    mockDb.mockReturnValue(db);

    const res = await POST(req("POST", { categoryId: FIVE_K }), params);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");
    expect(db.rpcs.filter(r => r.name === "itr_release_capacity")).toEqual([
      { name: "itr_release_capacity", args: { p_category_id: FIVE_K, p_count: 1 } },
    ]);
    // The old seat is not released when the move did not happen
    expect(db.rpcs.some(r => r.name === "itr_release_capacity" && r.args.p_category_id === TEN_K)).toBe(false);
  });
});
