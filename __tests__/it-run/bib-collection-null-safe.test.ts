/**
 * The BIB desk lookup must answer with arrays for every nested relation, even when the database returns null (no rows)
 * or a single object (a unique embed). The desk page reads these as lists; a null crashed it when staff scanned a QR.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake query builder is intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({
  requireRole: jest.fn(() => ({ email: "desk@example.com", role: "bib_collection" })),
  verifyItRunQR: jest.fn(() => null),
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { GET } from "@/app/api/it-run/bib-collection/route";

const mockDb = getSupabaseServer as jest.Mock;

function fakeDb(participants: any[]) {
  return {
    from() {
      const b: any = {};
      for (const m of ["select", "eq", "in", "or", "ilike", "is", "order", "limit", "returns"]) b[m] = () => b;
      b.then = (res: any, rej?: any) => Promise.resolve({ data: participants, error: null }).then(res, rej);
      return b;
    },
  };
}

function base(over: Record<string, unknown> = {}) {
  return {
    id: "p1", first_name: "Asha", last_name: "Rao", email: "asha@example.com", mobile: "9876543210",
    company_name: null, bib_number: null, wave: null, verification_status: "verified", verification_outcome: "company_verified",
    verification_version: 1, participant_type: "primary", cancelled_at: null, tshirt_size: "M",
    it_run_registrations: { id: "r1", registration_code: "ITRUN2-AAAA", payment_status: "paid", final_price: 649, it_run_categories: { name: "5K Timed Run", distance_km: 5 }, it_run_events: { title: "The IT Run Sprint-2" } },
    it_run_bib_collections: null,
    ...over,
  };
}

function req() {
  return new NextRequest("http://t/api/it-run/bib-collection?q=9876543210");
}

describe("BIB desk lookup answers with lists, never null", () => {
  it("a runner with no BIB collection yet (null from the database) gets an empty list and is not collected", async () => {
    mockDb.mockReturnValue(fakeDb([base({ it_run_bib_collections: null })]));
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.results[0].it_run_bib_collections).toEqual([]);
    expect(body.results[0].readiness.state).not.toBe("already_collected");
  });

  it("a runner with a collection stored as a single object is returned as a one-item list and is collected", async () => {
    mockDb.mockReturnValue(fakeDb([base({ it_run_bib_collections: { id: "c1", collected_at: "2027-02-07T04:00:00Z" } })]));
    const res = await GET(req());
    const body = await res.json();
    expect(body.results[0].it_run_bib_collections).toEqual([{ id: "c1", collected_at: "2027-02-07T04:00:00Z" }]);
    expect(body.results[0].readiness.state).toBe("already_collected");
  });

  it("missing booking and check-in relations are also lists", async () => {
    mockDb.mockReturnValue(fakeDb([base({ it_run_bib_bookings: null, it_run_checkins: null })]));
    const res = await GET(req());
    const body = await res.json();
    expect(body.results[0].it_run_bib_bookings).toEqual([]);
    expect(body.results[0].it_run_checkins).toEqual([]);
  });
});
