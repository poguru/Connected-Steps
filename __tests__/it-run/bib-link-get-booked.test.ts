/**
 * The BIB link GET must answer for a runner who has already booked. PostgREST returns a unique embed (one booking per
 * runner) as a single object, not a list. Reading it with .find threw, which made the link fail after a booking.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake database is intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
  checkAndRecordEndpointLimit: jest.fn().mockResolvedValue({ limited: false, retryAfter: 0 }),
  getClientIp: jest.fn(() => "203.0.113.9"),
}));

import { getSupabaseServer } from "@/lib/supabase-server";
import { GET } from "@/app/api/events/it-run-sprint-2/bib-collection/[token]/route";

const mockDb = getSupabaseServer as jest.Mock;
const TOKEN = "b".repeat(48);
const SLOT = { id: "s1", location_name: "Gate A", location_address: null, slot_date: "2027-02-06", start_time: "09:00", end_time: "11:00", capacity: 100, is_active: true };

function fakeDb(bookingShape: "object" | "null" | "list") {
  const bookingFor = (): any => {
    if (bookingShape === "null") return null;
    const one = { id: "bk1", status: "confirmed", it_run_bib_slots: SLOT };
    return bookingShape === "list" ? [one] : one;
  };
  const participants = [{
    id: "p1", first_name: "Asha", last_name: "Rao", participant_type: "primary",
    it_run_bib_bookings: bookingFor(),
  }];
  const rowsFor = (table: string): any => {
    if (table === "it_run_participants") return participants;
    if (table === "it_run_bib_slots") return [SLOT];
    if (table === "it_run_bib_bookings") return [];
    return [];
  };
  return {
    from(table: string) {
      const b: any = {};
      for (const m of ["select", "eq", "is", "in", "order"]) b[m] = () => b;
      b.maybeSingle = () => {
        if (table === "it_run_registrations") {
          return Promise.resolve({ data: { id: "r1", registration_code: "ITRUN2-AAAA", lead_email: "a@x", participant_count: 1, payment_status: "paid", registration_status: "active", it_run_categories: null, it_run_events: null }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };
      b.then = (res: any, rej?: any) => Promise.resolve({ data: rowsFor(table), error: null }).then(res, rej);
      return b;
    },
  };
}

const params = { params: Promise.resolve({ token: TOKEN }) };

describe("the BIB link page loads for a runner who has booked", () => {
  it("a booking returned as one object (the real shape) shows the confirmed slot, not a failure", async () => {
    mockDb.mockReturnValue(fakeDb("object"));
    const res = await GET({} as any, params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.participants[0].current_booking).toMatchObject({ location_name: "Gate A" });
  });

  it("a runner with no booking (null) loads with no confirmed slot", async () => {
    mockDb.mockReturnValue(fakeDb("null"));
    const res = await GET({} as any, params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.participants[0].current_booking).toBeNull();
  });

  it("a booking returned as a list also loads", async () => {
    mockDb.mockReturnValue(fakeDb("list"));
    const res = await GET({} as any, params);
    const body = await res.json();
    expect(body.participants[0].current_booking).toMatchObject({ location_name: "Gate A" });
  });
});
