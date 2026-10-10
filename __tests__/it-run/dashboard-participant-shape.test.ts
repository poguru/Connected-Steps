/**
 * The participant dashboard must open for every participant, including one who already has a BIB booking,
 * a BIB collection or a check-in. Those three tables have UNIQUE(participant_id), so PostgREST returns a single
 * object for them (or null), not a list. The response must still be a valid dashboard payload.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth", () => ({ verifyUserToken: jest.fn(), USER_SESSION_COOKIE: "cs_user_session" }));
jest.mock("@/lib/it-run-auth", () => ({
  ...jest.requireActual("@/lib/it-run-auth"),
  itRunActionKey: () => Buffer.alloc(32, 9),
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { GET } from "@/app/api/it-run/dashboard/[code]/route";
import { isDashboardPayload } from "@/lib/it-run-dashboard";

const mockDb = getSupabaseServer as jest.Mock;
const mockUser = verifyUserToken as jest.Mock;

const OWNER = "asha@example.com";
const CODE = "ITR-0001";

const REG = {
  id: "reg-1", registration_code: CODE, lead_email: OWNER, linked_user_email: OWNER,
  participant_count: 2, base_price: 799, discount_amount: 0, final_price: 799, early_bird_offer_id: null,
  payment_status: "paid", registration_status: "active", cancelled_reason: null, cancelled_at: null, coupon_id: null,
  created_at: "2026-10-01T00:00:00Z", qr_token: null,
  it_run_categories: { id: "cat-1", slug: "5k", name: "5K Timed Run", distance_km: 5, category_type: "solo", color: "#e8620a", includes_timing: false, includes_medal: false },
  it_run_events: { id: "ev-1", title: "The IT Run Sprint-2", event_date: "2027-02-07", report_time: null, flag_off_time: null, venue_name: null, venue_address: null, city: null },
};

/** Participant rows shaped the way PostgREST returns them for UNIQUE(participant_id) embeds. */
const PARTICIPANTS = [
  // Has a collection (single object) and a check-in (single object); no booking (null)
  {
    id: "p-1", participant_type: "parent", qr_token: "qr-1", first_name: "Asha", last_name: "Rao", gender: "female",
    email: OWNER, mobile: "9876543210", blood_group: null, company_name: null, tshirt_size: "M",
    bib_number: "5K-001", wave: null, collection_counter: null, verification_status: "verified",
    it_run_bib_bookings: null,
    it_run_bib_collections: { id: "c-1", collected_at: "2027-02-06T09:00:00Z" },
    it_run_checkins: { id: "k-1", checked_in_at: "2027-02-07T06:00:00Z" },
  },
  // Plain participant with no BIB activity at all
  {
    id: "p-2", participant_type: "child", qr_token: "qr-2", first_name: "Ravi", last_name: "Rao", gender: "male",
    email: null, mobile: "9876543211", blood_group: null, company_name: null, tshirt_size: "S",
    bib_number: null, wave: null, collection_counter: null, verification_status: "pending",
    it_run_bib_bookings: null, it_run_bib_collections: null, it_run_checkins: null,
  },
];

function fakeDb(participants: unknown[]) {
  return {
    from(table: string) {
      const b: any = {};
      for (const m of ["select", "eq", "order", "in"]) b[m] = () => b;
      b.maybeSingle = () => Promise.resolve(table === "it_run_registrations" ? { data: REG, error: null } : { data: null, error: null });
      b.then = (res: any, rej?: any) => {
        const data = table === "it_run_participants" ? participants : table === "it_run_bib_slots" ? [] : [];
        return Promise.resolve({ data, error: null }).then(res, rej);
      };
      return b;
    },
  };
}

function call(code = CODE) {
  return GET(
    new NextRequest(`http://t/api/it-run/dashboard/${code}`, { headers: { cookie: "cs_user_session=tok" } }),
    { params: Promise.resolve({ code }) },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.mockReturnValue(OWNER);
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

describe("participant dashboard response shape", () => {
  it("opens for a participant with a collection and a check-in, and returns lists", async () => {
    mockDb.mockReturnValue(fakeDb(PARTICIPANTS));
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    const [withActivity] = body.participants;
    expect(withActivity.it_run_bib_collections).toEqual([{ id: "c-1", collected_at: "2027-02-06T09:00:00Z" }]);
    expect(withActivity.it_run_checkins).toEqual([{ id: "k-1", checked_in_at: "2027-02-07T06:00:00Z" }]);
    expect(withActivity.it_run_bib_bookings).toEqual([]);
    expect(isDashboardPayload(body)).toBe(true);
  });

  it("returns empty lists for a participant with no BIB activity", async () => {
    mockDb.mockReturnValue(fakeDb(PARTICIPANTS));
    const body = await (await call()).json();
    const plain = body.participants[1];
    expect(plain.it_run_bib_bookings).toEqual([]);
    expect(plain.it_run_bib_collections).toEqual([]);
    expect(plain.it_run_checkins).toEqual([]);
  });

  it("keeps a booking that comes back as a single object as a one-item list", async () => {
    mockDb.mockReturnValue(fakeDb([{ ...PARTICIPANTS[1], it_run_bib_bookings: { id: "b-1", status: "confirmed", it_run_bib_slots: null } }]));
    const body = await (await call()).json();
    expect(body.participants[0].it_run_bib_bookings).toHaveLength(1);
    expect(isDashboardPayload(body)).toBe(true);
  });

  it("still refuses a plain registration code without a signed-in owner (unchanged)", async () => {
    mockUser.mockReturnValue(null);
    mockDb.mockReturnValue(fakeDb(PARTICIPANTS));
    const res = await call();
    expect(res.status).toBe(401);
  });
});
