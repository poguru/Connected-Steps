/**
 * Admin CSV exports name the offer behind each discount: the early bird offer, or the coupon code.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({ requireRole: jest.fn() }));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";
import { GET } from "@/app/api/it-run/admin/reports/route";

const mockDb = getSupabaseServer as jest.Mock;
const mockRole = requireRole as jest.Mock;

const ROWS = [
  {
    registration_code: "ITR-EB", lead_email: "a@example.com", participant_count: 1, base_price: 799, discount_amount: 119,
    final_price: 680, payment_status: "paid", registration_status: "active", razorpay_payment_id: "pay_1", created_at: "2026-10-01",
    it_run_categories: { name: "5K Timed Run" }, it_run_coupons: null,
    it_run_early_bird_offers: { name: "Early Bird — 5K Timed Run" },
  },
  {
    registration_code: "ITR-CP", lead_email: "b@example.com", participant_count: 1, base_price: 799, discount_amount: 100,
    final_price: 699, payment_status: "paid", registration_status: "active", razorpay_payment_id: "pay_2", created_at: "2026-10-02",
    it_run_categories: { name: "5K Timed Run" }, it_run_coupons: { code: "FRIEND100" },
    it_run_early_bird_offers: null,
  },
  {
    registration_code: "ITR-FP", lead_email: "c@example.com", participant_count: 1, base_price: 799, discount_amount: 0,
    final_price: 799, payment_status: "paid", registration_status: "active", razorpay_payment_id: "pay_3", created_at: "2026-10-03",
    it_run_categories: { name: "5K Timed Run" }, it_run_coupons: null,
    it_run_early_bird_offers: null,
  },
];

/** Fake builder: any filter returns the builder, and awaiting it resolves the rows. */
function fakeDb(rows: unknown[]) {
  return {
    from(table: string) {
      const b: any = {};
      for (const m of ["select", "eq", "order", "in"]) b[m] = () => b;
      b.single = () => Promise.resolve({ data: { id: "ev-1" }, error: null });
      b.then = (res: any, rej?: any) => Promise.resolve({ data: table === "it_run_registrations" ? rows : [], error: null }).then(res, rej);
      return b;
    },
  };
}

function req(type: string) {
  return new NextRequest(`http://t/api/it-run/admin/reports?type=${type}`);
}

async function csvFor(type: string): Promise<string> {
  mockRole.mockReturnValue({ email: "admin@example.com", role: "event_admin" });
  mockDb.mockReturnValue(fakeDb(ROWS));
  const res = await GET(req(type));
  return res.text();
}

beforeEach(() => jest.clearAllMocks());

describe("admin registrations CSV: Offer column", () => {
  it("has an Offer column between Coupon and Category", async () => {
    const header = (await csvFor("registrations")).split("\n")[0];
    expect(header).toBe("Registration Code,Lead Email,Participant Count,Base Price,Discount,Final Price,Payment Status,Reg Status,Coupon,Offer,Category,Registered At");
  });

  it("names the early bird offer on an early bird row, the code on a coupon row, and leaves full-price rows blank", async () => {
    const lines = (await csvFor("registrations")).split("\n");
    const eb = lines.find(l => l.includes("ITR-EB"))!;
    const cp = lines.find(l => l.includes("ITR-CP"))!;
    const fp = lines.find(l => l.includes("ITR-FP"))!;
    expect(eb).toContain('"Early Bird — 5K Timed Run"');
    expect(cp).toContain('"FRIEND100","","5K Timed Run"');
    expect(fp).toContain('"","","5K Timed Run"');
  });
});

describe("admin revenue CSV: Offer column", () => {
  it("has an Offer column after Category and fills it for early bird rows", async () => {
    const lines = (await csvFor("revenue")).split("\n");
    expect(lines[0]).toContain("Category,Offer,Base Price");
    const eb = lines.find(l => l.includes("ITR-EB"))!;
    expect(eb).toContain('"5K Timed Run","Early Bird — 5K Timed Run","799"');
  });
});

describe("admin report access", () => {
  it("refuses a caller without an admin session", async () => {
    mockRole.mockReturnValue(null);
    mockDb.mockReturnValue(fakeDb(ROWS));
    const res = await GET(req("registrations"));
    expect(res.status).toBe(401);
  });
});
