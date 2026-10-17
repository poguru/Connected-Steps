/**
 * The T-shirt inventory route must load when the database returns null for a runner with no T-shirt issuance rows
 * (PostgREST does this for empty to-many relations), and must answer with JSON when something else fails.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake query builder is intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({
  requireRole: jest.fn(() => ({ email: "admin@example.com", role: "event_admin" })),
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { GET } from "@/app/api/it-run/admin/tshirt/route";

const mockDb = getSupabaseServer as jest.Mock;

/** A chainable query: every filter returns the same builder; awaiting it resolves to the rows for its table. */
function fakeDb(rowsByTable: Record<string, any>) {
  return {
    from(table: string) {
      const b: any = {};
      for (const m of ["select", "eq", "in", "not", "order", "is", "single", "maybeSingle"]) b[m] = () => b;
      b.single = () => Promise.resolve({ data: rowsByTable[table], error: null });
      b.then = (res: any, rej?: any) => Promise.resolve({ data: rowsByTable[table] ?? [], error: null }).then(res, rej);
      return b;
    },
  };
}

const EVENT = { id: "ev-1" };
const CATEGORIES = [{ id: "c1", name: "10K Timed", color: "#e8620a" }];

function participant(over: Record<string, unknown> = {}) {
  return {
    id: "p1", first_name: "Asha", last_name: "Rao", mobile: "9876543210", email: "asha@example.com",
    tshirt_size: "M", participant_type: "solo",
    it_run_registrations: {
      id: "r1", registration_code: "ITRUN2-AAAA", lead_email: "asha@example.com",
      payment_status: "paid", registration_status: "active", category_id: "c1",
      it_run_categories: { id: "c1", name: "10K Timed", color: "#e8620a" },
    },
    it_run_tshirt_issuances: null,
    ...over,
  };
}

function req(url = "http://t/api/it-run/admin/tshirt") {
  return new NextRequest(url);
}

describe("T-shirt inventory route", () => {
  it("loads when a runner has no issuance rows (null from the database)", async () => {
    mockDb.mockReturnValue(fakeDb({
      it_run_events: EVENT,
      it_run_categories: CATEGORIES,
      it_run_participants: [participant()],
    }));
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.total_participants).toBe(1);
    expect(body.summary.total_not_issued).toBe(1);
    expect(body.participants[0].issued).toBe(false);
  });

  it("counts a runner who has a handed-out T-shirt", async () => {
    mockDb.mockReturnValue(fakeDb({
      it_run_events: EVENT,
      it_run_categories: CATEGORIES,
      it_run_participants: [participant({ it_run_tshirt_issuances: [{ id: "t1", issued_at: "2027-02-07T05:00:00Z" }] })],
    }));
    const res = await GET(req());
    const body = await res.json();
    expect(body.summary.total_issued).toBe(1);
    expect(body.participants[0].issued).toBe(true);
  });

  it("a runner with no mobile number does not break the search", async () => {
    mockDb.mockReturnValue(fakeDb({
      it_run_events: EVENT,
      it_run_categories: CATEGORIES,
      it_run_participants: [participant({ mobile: null })],
    }));
    const res = await GET(req("http://t/api/it-run/admin/tshirt?search=asha"));
    expect(res.status).toBe(200);
  });

  it("answers with JSON, not a bare server error, when something fails", async () => {
    mockDb.mockImplementation(() => { throw new Error("database unavailable"); });
    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
  });
});
