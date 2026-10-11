/**
 * Participant dashboard reliability. A failed refresh after a successful booking must not hide the registration, a
 * transient database error is retried once, and a missing registration is still reported as missing.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake Supabase builder is intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-dashboard-link", () => ({
  verifyDashboardToken: jest.fn(() => ({ ok: true, registrationCode: "ITR-ABC" })),
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { dashboardScreen } from "@/lib/it-run-dashboard";
import { GET } from "@/app/api/it-run/dashboard/[code]/route";

describe("dashboardScreen", () => {
  it("shows the loading state before anything has loaded", () => {
    expect(dashboardScreen({ hasData: false, loading: true, failure: null })).toBe("loading");
  });

  it("replaces the page with the error only when the first load fails", () => {
    expect(dashboardScreen({ hasData: false, loading: false, failure: "SERVER_ERROR" })).toBe("error_page");
  });

  it("keeps loaded content when a refresh fails, with a notice", () => {
    expect(dashboardScreen({ hasData: true, loading: false, failure: "SERVER_ERROR" })).toBe("content_with_refresh_error");
    expect(dashboardScreen({ hasData: true, loading: false, failure: "NETWORK" })).toBe("content_with_refresh_error");
  });

  it("shows the content as normal when it loaded", () => {
    expect(dashboardScreen({ hasData: true, loading: false, failure: null })).toBe("content");
  });
});

// ── API: a transient database error is retried once ─────────────────────────────

const REG_ROW = {
  id: "r-1", registration_code: "ITR-ABC", lead_email: "asha@example.com", participant_count: 1,
  base_price: 999, discount_amount: 0, final_price: 999, payment_status: "paid", registration_status: "active",
  cancelled_reason: null, cancelled_at: null, coupon_id: null, early_bird_offer_id: null, created_at: "2026-10-01T00:00:00Z",
  qr_token: null, linked_user_email: null,
  it_run_categories: { id: "c-1", slug: "10k", name: "10K", distance_km: 10, category_type: "solo", color: "#e8620a", includes_timing: true, includes_medal: true },
  it_run_events: { id: "ev-1", title: "The IT Run", event_date: "2027-02-07", report_time: "5:30 AM", flag_off_time: "6:00 AM", venue_name: "", venue_address: "", city: "" },
};

function dashboardDb(opts: { regFailuresBeforeSuccess?: number; regMissing?: boolean; participantsFail?: boolean } = {}) {
  let regCalls = 0;
  const participants = [{ id: "p-1", first_name: "Asha", last_name: "Rao", it_run_bib_bookings: null, it_run_bib_collections: null, it_run_checkins: null }];
  return {
    regCalls: () => regCalls,
    from(table: string) {
      const b: any = {};
      b.select = () => b;
      b.eq = () => b;
      b.order = () => b;
      b.maybeSingle = () => {
        if (table === "it_run_registrations") {
          regCalls++;
          if (opts.regMissing) return Promise.resolve({ data: null, error: null });
          if (regCalls <= (opts.regFailuresBeforeSuccess ?? 0)) return Promise.resolve({ data: null, error: { code: "08006", message: "reset" } });
          return Promise.resolve({ data: REG_ROW, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };
      b.then = (res: any, rej?: any) => {
        if (table === "it_run_participants") {
          const out = opts.participantsFail ? { data: null, error: { code: "XX000" } } : { data: participants, error: null };
          return Promise.resolve(out).then(res, rej);
        }
        if (table === "it_run_bib_slots") return Promise.resolve({ data: [], error: null }).then(res, rej);
        return Promise.resolve({ data: [], error: null }).then(res, rej);
      };
      return b;
    },
  };
}

function get() {
  return GET(
    new NextRequest("http://t/api/it-run/dashboard/token"),
    { params: Promise.resolve({ code: "token" }) },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("GET /api/it-run/dashboard/[code]: transient failures", () => {
  it("a single transient registration error is retried and the dashboard loads", async () => {
    const db = dashboardDb({ regFailuresBeforeSuccess: 1 });
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await get();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.reg.registration_code).toBe("ITR-ABC");
    expect(db.regCalls()).toBe(2);
  });

  it("a persistent database error still returns SERVER_ERROR, with a request id", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(dashboardDb({ regFailuresBeforeSuccess: 5 }));
    const res = await get();
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("SERVER_ERROR");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("a registration that really does not exist is a 404, not an error", async () => {
    const db = dashboardDb({ regMissing: true });
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await get();
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("NOT_FOUND");
    expect(db.regCalls()).toBe(1);
  });

  it("a participant query failure is a SERVER_ERROR and never an empty dashboard", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(dashboardDb({ participantsFail: true }));
    const res = await get();
    expect(res.status).toBe(500);
  });

  it("a paid registration with null optional relations still loads with empty lists", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(dashboardDb());
    const res = await get();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.participants[0].it_run_bib_bookings).toEqual([]);
    expect(json.participants[0].it_run_bib_collections).toEqual([]);
    expect(json.participants[0].it_run_checkins).toEqual([]);
  });
});
