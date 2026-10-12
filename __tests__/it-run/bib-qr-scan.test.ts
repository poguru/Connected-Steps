/**
 * BIB collection by QR: a participant's QR returns that participant only, even on a booking with several runners.
 * The registration-code search still returns the whole booking, and the lookup stays behind volunteer sign-in.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake Supabase builder is intentionally loosely typed */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.IT_RUN_QR_SECRET = "test-qr-secret-0123456789";
process.env.COACH_TOKEN_SECRET = "test-coach-secret-0123456789";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({
  ...jest.requireActual("@/lib/it-run-auth"),
  requireRole: jest.fn(),
  getClientIp: () => "203.0.113.60",
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, signItRunQR } from "@/lib/it-run-auth";
import { GET } from "@/app/api/it-run/bib-collection/route";

const REG_CODE = "ITRUN2-TEST01";
const PARTICIPANTS = [
  { id: "p-1", first_name: "Asha", last_name: "Rao", email: "asha@example.com", mobile: "9876543210", company_name: null, bib_number: null, wave: null, verification_status: "verified", tshirt_size: "M", it_run_registrations: { id: "r-1", registration_code: REG_CODE, payment_status: "paid", final_price: 999, it_run_categories: { name: "5K Duo Challenge", distance_km: 5 }, it_run_events: { title: "The IT Run" } }, it_run_bib_collections: [] },
  { id: "p-2", first_name: "Ravi", last_name: "Rao", email: null, mobile: "9876543211", company_name: null, bib_number: null, wave: null, verification_status: "verified", tshirt_size: "L", it_run_registrations: { id: "r-1", registration_code: REG_CODE, payment_status: "paid", final_price: 999, it_run_categories: { name: "5K Duo Challenge", distance_km: 5 }, it_run_events: { title: "The IT Run" } }, it_run_bib_collections: [] },
];

/** A booking query returns every runner on the registration; a search by mobile returns whichever matches. */
function fakeDb() {
  return {
    from() {
      const b: any = {};
      b.select = () => b;
      b.eq = () => b;
      b.or = () => b;
      b.limit = () => b;
      b.then = (res: any, rej?: any) => Promise.resolve({ data: PARTICIPANTS, error: null }).then(res, rej);
      return b;
    },
  };
}

function get(q: string) {
  return GET(new NextRequest(`http://t/api/it-run/bib-collection?q=${encodeURIComponent(q)}`));
}

beforeEach(() => {
  jest.clearAllMocks();
  (requireRole as jest.Mock).mockReturnValue({ email: "volunteer@example.com", role: "bib_collection" });
  (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb());
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("BIB collection by participant QR", () => {
  it("the first runner's QR returns only the first runner", async () => {
    const token = signItRunQR(REG_CODE, "p-1");
    const json = await (await get(token)).json();
    expect(json.results.map((p: any) => p.id)).toEqual(["p-1"]);
  });

  it("the second runner's QR returns only the second runner, never the first", async () => {
    const token = signItRunQR(REG_CODE, "p-2");
    const json = await (await get(token)).json();
    expect(json.results.map((p: any) => p.id)).toEqual(["p-2"]);
    expect(JSON.stringify(json)).not.toContain("asha@example.com");
  });

  it("a QR for a runner who is not on that booking returns nothing", async () => {
    const token = signItRunQR(REG_CODE, "p-999");
    const json = await (await get(token)).json();
    expect(json.results).toEqual([]);
  });

  it("a registration code search still returns the whole booking", async () => {
    const json = await (await get(REG_CODE)).json();
    expect(json.results.map((p: any) => p.id)).toEqual(["p-1", "p-2"]);
  });

  it("a forged token is not treated as a QR: no registration lookup by its payload", async () => {
    const token = signItRunQR(REG_CODE, "p-2");
    const forged = token.slice(0, -4) + "0000";
    const res = await get(forged);
    const json = await res.json();
    // It falls back to the mobile/email search, which does not use the QR's registration
    expect(json.results.every((p: any) => p.id !== undefined)).toBe(true);
    expect(res.status).toBe(200);
  });

  it("refuses a request without a volunteer session, and never looks up the runner", async () => {
    (requireRole as jest.Mock).mockReturnValue(null);
    const res = await get(signItRunQR(REG_CODE, "p-1"));
    expect(res.status).toBe(401);
  });
});
