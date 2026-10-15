/**
 * Early-bird offers for all categories at once: one offer per category, all or nothing, each checked against its own price.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake Supabase builder is intentionally loosely typed */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({
  requireRole: jest.fn(),
  getClientIp: () => "203.0.113.70",
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";
import { POST } from "@/app/api/it-run/admin/early-bird/route";

const EVENT = "11111111-1111-4111-8111-111111111111";
const CATEGORIES = [
  { id: "c-duo", name: "Parent & Child Duo", price_rupees: 999, is_active: true },
  { id: "c-5k-duo", name: "5K Duo Challenge", price_rupees: 1399, is_active: true },
  { id: "c-5k", name: "5K Fun Run", price_rupees: 649, is_active: true },
  { id: "c-10k", name: "10K Timed Run", price_rupees: 999, is_active: true },
  { id: "c-5kt", name: "5K Timed Run", price_rupees: 799, is_active: true },
];

function fakeDb(categories = CATEGORIES) {
  const inserts: Array<{ table: string; rows: any }> = [];
  return {
    inserts,
    from(table: string) {
      let pending: any = null;
      const b: any = {};
      b.select = () => b;
      b.eq = () => b;
      b.returns = () => b;
      b.maybeSingle = () => Promise.resolve({ data: table === "it_run_events" ? { id: EVENT } : null, error: null });
      b.insert = (rows: any) => {
        pending = rows;
        inserts.push({ table, rows });
        return b;
      };
      b.then = (res: any, rej?: any) => {
        let data: any = [];
        if (table === "it_run_categories") data = categories;
        if (table === "it_run_early_bird_offers" && pending) {
          data = (Array.isArray(pending) ? pending : [pending]).map((r: any, i: number) => ({ ...r, id: `offer-${i + 1}` }));
        }
        return Promise.resolve({ data, error: null }).then(res, rej);
      };
      return b;
    },
  };
}

function req(body: unknown) {
  return new NextRequest("http://t/api/it-run/admin/early-bird", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const BASE = {
  name: "Early Bird",
  discount_type: "percent",
  discount_value: 99,
  starts_at: "2026-10-15T00:00:00Z",
  ends_at: "2027-01-19T00:00:00Z",
  status: "active",
  redemption_limit: null,
  min_payable_rupees: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  (requireRole as jest.Mock).mockReturnValue({ email: "admin@example.com", role: "event_admin" });
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("early-bird offer for all categories", () => {
  it("creates one 99% offer for each of the five categories in one save", async () => {
    const db = fakeDb();
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await POST(req({ ...BASE, category_id: "all" }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.count).toBe(5);
    const rows = db.inserts.find(i => i.table === "it_run_early_bird_offers")!.rows;
    expect(rows.map((r: any) => r.category_id).sort()).toEqual(CATEGORIES.map(c => c.id).sort());
    expect(rows.every((r: any) => r.discount_value === 99 && r.discount_type === "percent")).toBe(true);
  });

  it("a fixed discount larger than the cheapest category refuses the whole save and names the category", async () => {
    const db = fakeDb();
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await POST(req({ ...BASE, discount_type: "fixed", discount_value: 700, category_id: "all" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/5K Fun Run/);
    expect(db.inserts.some(i => i.table === "it_run_early_bird_offers")).toBe(false);
  });

  it("a single category still creates one offer, as before", async () => {
    const db = fakeDb();
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await POST(req({ ...BASE, category_id: "c-5k" }));
    expect(res.status).toBe(201);
    expect((await res.json()).offer.category_id).toBe("c-5k");
  });

  it("a category that is not part of this event is refused and nothing is saved", async () => {
    const db = fakeDb();
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await POST(req({ ...BASE, category_id: "not-a-category" }));
    expect(res.status).toBe(400);
    expect(db.inserts.some(i => i.table === "it_run_early_bird_offers")).toBe(false);
  });
});
