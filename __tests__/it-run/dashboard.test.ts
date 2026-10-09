/**
 * Participant dashboard: response contract, failure classification, and API behavior.
 *
 * Regression for "Cannot read properties of null (reading 'length')": nested to-many
 * relations from PostgREST can be null. The API must normalize them to arrays, and the
 * page must never render a payload that is missing required fields.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake Supabase builder is intentionally loosely typed */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { GET } from "@/app/api/it-run/dashboard/[code]/route";
import {
  isDashboardPayload,
  classifyDashboardFailure,
  DASHBOARD_FAILURE_MESSAGES,
} from "@/lib/it-run-dashboard";

const mockDb = getSupabaseServer as jest.Mock;

type Result = { data: unknown; error: { code?: string; message: string } | null };

/** Table-keyed fake. Each handler receives the table name and returns { data, error }. */
function fakeDb(handlers: Record<string, () => Result>) {
  return {
    from(table: string) {
      const b: any = {
        select() { return b; },
        eq() { return b; },
        order() { return b; },
        maybeSingle() { return run(); },
        then(res: (v: Result) => unknown, rej?: (e: unknown) => unknown) { return run().then(res, rej); },
      };
      function run() {
        return Promise.resolve(handlers[table] ? handlers[table]() : { data: null, error: null });
      }
      return b;
    },
  };
}

const REG = {
  id: "reg-1",
  registration_code: "ITR-0001",
  lead_email: "lead@example.com",
  participant_count: 2,
  base_price: 100000,
  discount_amount: 0,
  final_price: 100000,
  payment_status: "pending",
  registration_status: "active",
  cancelled_reason: null,
  cancelled_at: null,
  coupon_id: null,
  created_at: "2026-08-01T00:00:00Z",
  qr_token: null,
  it_run_categories: { id: "c1", slug: "10k", name: "10K", distance_km: 10, category_type: "timed", color: "#fff", includes_timing: true, includes_medal: true },
  it_run_events: { id: "ev-1", title: "The IT Run Sprint-2", event_date: "2026-08-17", report_time: null, flag_off_time: null, venue_name: null, venue_address: null, city: "Hyderabad" },
};

const PARTICIPANT_NULLS = {
  id: "p-1", first_name: "Asha", last_name: "Rao", qr_token: null, bib_number: null,
  it_run_bib_bookings: null, it_run_bib_collections: null, it_run_checkins: null,
};

function call(code: string) {
  return GET(new NextRequest(`http://t/api/it-run/dashboard/${code}`), { params: Promise.resolve({ code }) });
}

beforeEach(() => jest.clearAllMocks());

describe("isDashboardPayload", () => {
  const valid = {
    reg: { id: "r", registration_code: "ITR-1", payment_status: "paid", registration_status: "active" },
    participants: [{ id: "p", first_name: "A", last_name: "B", it_run_bib_bookings: [], it_run_bib_collections: [], it_run_checkins: [] }],
    bibSlots: [],
  };

  it("accepts a complete payload, including empty participant and slot arrays", () => {
    expect(isDashboardPayload(valid)).toBe(true);
    expect(isDashboardPayload({ ...valid, participants: [] })).toBe(true);
  });

  it("rejects a missing or malformed registration", () => {
    expect(isDashboardPayload({ ...valid, reg: undefined })).toBe(false);
    expect(isDashboardPayload({ ...valid, reg: { ...valid.reg, payment_status: null } })).toBe(false);
    expect(isDashboardPayload({ ...valid, reg: { ...valid.reg, id: "" } })).toBe(false);
  });

  it("rejects missing arrays instead of letting them crash the render", () => {
    expect(isDashboardPayload({ ...valid, participants: undefined })).toBe(false);
    expect(isDashboardPayload({ ...valid, bibSlots: null })).toBe(false);
  });

  it("rejects participants whose nested relations are null (the reported crash shape)", () => {
    const withNull = { ...valid, participants: [{ ...valid.participants[0], it_run_checkins: null }] };
    expect(isDashboardPayload(withNull)).toBe(false);
  });

  it("rejects non-object values", () => {
    expect(isDashboardPayload(null)).toBe(false);
    expect(isDashboardPayload("error")).toBe(false);
    expect(isDashboardPayload([])).toBe(false);
  });
});

describe("classifyDashboardFailure", () => {
  it("maps 404 and NOT_FOUND to not found", () => {
    expect(classifyDashboardFailure(404, { error: "x", code: "NOT_FOUND" })).toBe("NOT_FOUND");
  });

  it("maps server errors, with or without a body, to SERVER_ERROR", () => {
    expect(classifyDashboardFailure(500, { code: "SERVER_ERROR" })).toBe("SERVER_ERROR");
    expect(classifyDashboardFailure(502, null)).toBe("SERVER_ERROR");
  });

  it("treats other statuses as an invalid response", () => {
    expect(classifyDashboardFailure(400, { error: "bad" })).toBe("INVALID_RESPONSE");
  });

  it("never exposes raw error text in participant messages", () => {
    for (const msg of Object.values(DASHBOARD_FAILURE_MESSAGES)) {
      expect(msg).not.toMatch(/reading|undefined|null|TypeError|stack/i);
    }
    expect(DASHBOARD_FAILURE_MESSAGES.NOT_FOUND).toBe("We couldn't find a registration associated with this link.");
  });
});

describe("GET /api/it-run/dashboard/[code]", () => {
  it("returns 200 with null nested relations normalized to arrays", async () => {
    mockDb.mockReturnValue(fakeDb({
      it_run_registrations: () => ({ data: REG, error: null }),
      it_run_participants: () => ({ data: [PARTICIPANT_NULLS], error: null }),
      it_run_bib_slots: () => ({ data: [], error: null }),
    }));

    const res = await call("ITR-0001");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.participants[0].it_run_bib_bookings).toEqual([]);
    expect(body.participants[0].it_run_bib_collections).toEqual([]);
    expect(body.participants[0].it_run_checkins).toEqual([]);
    expect(isDashboardPayload(body)).toBe(true);
  });

  it("returns 200 with empty arrays for a registration with no participants", async () => {
    mockDb.mockReturnValue(fakeDb({
      it_run_registrations: () => ({ data: REG, error: null }),
      it_run_participants: () => ({ data: [], error: null }),
      it_run_bib_slots: () => ({ data: [], error: null }),
    }));

    const res = await call("ITR-0001");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.participants).toEqual([]);
    expect(isDashboardPayload(body)).toBe(true);
  });

  it("returns 404 with NOT_FOUND when no registration matches the code", async () => {
    mockDb.mockReturnValue(fakeDb({ it_run_registrations: () => ({ data: null, error: null }) }));

    const res = await call("ITR-9999");
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 500 (not 404) when the registration query fails", async () => {
    mockDb.mockReturnValue(fakeDb({
      it_run_registrations: () => ({ data: null, error: { code: "08006", message: "connection refused" } }),
    }));

    const res = await call("ITR-0001");
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("SERVER_ERROR");
    expect(JSON.stringify(body)).not.toContain("connection refused");
  });

  it("returns 500 when the participant query fails instead of showing zero participants", async () => {
    mockDb.mockReturnValue(fakeDb({
      it_run_registrations: () => ({ data: REG, error: null }),
      it_run_participants: () => ({ data: null, error: { code: "42703", message: "column does not exist" } }),
      it_run_bib_slots: () => ({ data: [], error: null }),
    }));

    const res = await call("ITR-0001");

    expect(res.status).toBe(500);
  });

  it("returns 500 when the BIB slot query fails", async () => {
    mockDb.mockReturnValue(fakeDb({
      it_run_registrations: () => ({ data: REG, error: null }),
      it_run_participants: () => ({ data: [], error: null }),
      it_run_bib_slots: () => ({ data: null, error: { code: "57014", message: "timeout" } }),
    }));

    const res = await call("ITR-0001");

    expect(res.status).toBe(500);
  });

  it("keeps multiple and parent-and-child participants with their own QR tokens", async () => {
    mockDb.mockReturnValue(fakeDb({
      it_run_registrations: () => ({ data: REG, error: null }),
      it_run_participants: () => ({
        data: [
          { ...PARTICIPANT_NULLS, id: "p-1", qr_token: "qr-parent" },
          { ...PARTICIPANT_NULLS, id: "p-2", first_name: "Child", qr_token: "qr-child", it_run_checkins: [{ id: "c1", checked_in_at: "2026-08-17T06:00:00Z" }] },
        ],
        error: null,
      }),
      it_run_bib_slots: () => ({ data: [], error: null }),
    }));

    const res = await call("ITR-0001");
    const body = await res.json();

    expect(body.participants.map((p: any) => p.qr_token)).toEqual(["qr-parent", "qr-child"]);
    expect(body.participants[1].it_run_checkins).toHaveLength(1);
    expect(isDashboardPayload(body)).toBe(true);
  });
});
