/**
 * Participant dashboard access: signed links, owner sessions, and expiry.
 *  - A signed token opens its registration without sign-in, and is read-only.
 *  - A plain registration code needs a signed-in account that owns the registration.
 *  - Tokens are tamper-evident and expire.
 *  - The linked account email is never returned.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */
process.env.NEXT_PUBLIC_APP_URL = "https://www.connectedsteps.in";

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
import {
  issueDashboardToken,
  verifyDashboardToken,
  buildDashboardUrl,
  DASHBOARD_LINK_TTL_MS,
} from "@/lib/it-run-dashboard-link";
import { classifyDashboardFailure } from "@/lib/it-run-dashboard";

const mockDb = getSupabaseServer as jest.Mock;
const mockUser = verifyUserToken as jest.Mock;

const OWNER = "owner@example.com";
const CODE = "ITR-0001";
const NOW = Date.UTC(2026, 9, 9);

type Result = { data: unknown; error: { code?: string; message: string } | null };

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
  id: "reg-1", registration_code: CODE, lead_email: "lead@example.com", linked_user_email: OWNER,
  participant_count: 1, base_price: 1, discount_amount: 0, final_price: 1, payment_status: "paid",
  registration_status: "active", cancelled_reason: null, cancelled_at: null, coupon_id: null,
  created_at: "2026-08-01T00:00:00Z", qr_token: null,
  it_run_categories: null,
  it_run_events: { id: "ev-1", title: "The IT Run Sprint-2", event_date: "2026-08-17", report_time: null, flag_off_time: null, venue_name: null, venue_address: null, city: null },
};

function handlers(reg: unknown = REG) {
  return {
    it_run_registrations: () => ({ data: reg, error: null }),
    it_run_participants: () => ({ data: [], error: null }),
    it_run_bib_slots: () => ({ data: [], error: null }),
  };
}

function call(pathCode: string, opts: { cookie?: string } = {}) {
  const headers: Record<string, string> = opts.cookie ? { cookie: `cs_user_session=${opts.cookie}` } : {};
  return GET(
    new NextRequest(`http://t/api/it-run/dashboard/${pathCode}`, { headers }),
    { params: Promise.resolve({ code: pathCode }) },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.mockReturnValue(null);
});

describe("signed dashboard tokens", () => {
  it("round-trip to the registration code", () => {
    const token = issueDashboardToken(CODE, NOW);
    expect(verifyDashboardToken(token, NOW + 1000)).toEqual({ ok: true, registrationCode: CODE });
  });

  it("do not contain the registration code in the URL", () => {
    expect(buildDashboardUrl(CODE)).not.toContain(CODE);
  });

  it("are rejected once tampered with", () => {
    const token = issueDashboardToken(CODE, NOW);
    const bytes = Buffer.from(token, "base64url");
    bytes[bytes.length - 2] ^= 0x10;
    expect(verifyDashboardToken(bytes.toString("base64url"), NOW).ok).toBe(false);
  });

  it("expire after 90 days", () => {
    const token = issueDashboardToken(CODE, NOW);
    expect(verifyDashboardToken(token, NOW + DASHBOARD_LINK_TTL_MS + 1)).toEqual({ ok: false, reason: "expired" });
  });

  it("treat a plain registration code as not a token", () => {
    expect(verifyDashboardToken(CODE, NOW).ok).toBe(false);
  });
});

describe("GET /api/it-run/dashboard/[code]", () => {
  it("opens with a valid token and no sign-in", async () => {
    mockDb.mockReturnValue(fakeDb(handlers()));
    const token = issueDashboardToken(CODE);

    const res = await call(token);

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("returns 410 EXPIRED_LINK for an expired token", async () => {
    mockDb.mockReturnValue(fakeDb(handlers()));
    const expired = issueDashboardToken(CODE, Date.now() - DASHBOARD_LINK_TTL_MS - 60_000);

    const res = await call(expired);
    const body = await res.json();

    expect(res.status).toBe(410);
    expect(body.code).toBe("EXPIRED_LINK");
    expect(classifyDashboardFailure(res.status, body)).toBe("EXPIRED_LINK");
  });

  it("requires a signed-in owner for a plain registration code (401 AUTH_REQUIRED)", async () => {
    mockDb.mockReturnValue(fakeDb(handlers()));

    const res = await call(CODE);

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("AUTH_REQUIRED");
  });

  it("refuses a signed-in account that does not own the registration", async () => {
    mockDb.mockReturnValue(fakeDb(handlers()));
    mockUser.mockReturnValue("someone-else@example.com");

    const res = await call(CODE, { cookie: "other-session" });

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
  });

  it("allows the owning account to open a plain code", async () => {
    mockDb.mockReturnValue(fakeDb(handlers()));
    mockUser.mockReturnValue(OWNER);

    const res = await call(CODE, { cookie: "owner-session" });

    expect(res.status).toBe(200);
  });

  it("never returns the linked account email", async () => {
    mockDb.mockReturnValue(fakeDb(handlers()));
    const token = issueDashboardToken(CODE);

    const body = await (await call(token)).json();

    expect(body.reg.linked_user_email).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(OWNER);
  });

  it("returns 404 for an unknown code without asking for sign-in details", async () => {
    mockDb.mockReturnValue(fakeDb(handlers(null)));

    const res = await call("ITR-9999");

    expect(res.status).toBe(404);
  });

  it("does not write anything: only registration, participant, and slot tables are read", async () => {
    const touched: string[] = [];
    mockDb.mockReturnValue({
      from(table: string) {
        touched.push(table);
        return fakeDb(handlers()).from(table);
      },
    });

    await call(issueDashboardToken(CODE));

    expect(new Set(touched)).toEqual(new Set(["it_run_registrations", "it_run_participants", "it_run_bib_slots"]));
  });
});

describe("GET /api/it-run/dashboard/[code] discount label", () => {
  const EB_REG = {
    ...REG, base_price: 799, discount_amount: 119, final_price: 680, early_bird_offer_id: "offer-1",
  };

  it("names the early bird offer for an early bird booking", async () => {
    mockDb.mockReturnValue(fakeDb({
      ...handlers(EB_REG),
      it_run_early_bird_offers: () => ({ data: { name: "Early Bird — 5K Timed Run" }, error: null }),
    }));
    const body = await (await call(issueDashboardToken(CODE))).json();
    expect(body.reg.discount_label).toBe("Early Bird — 5K Timed Run");
    expect(body.reg.base_price).toBe(799);
  });

  it("labels a coupon discount as a discount code", async () => {
    mockDb.mockReturnValue(fakeDb(handlers({ ...REG, base_price: 799, discount_amount: 100, final_price: 699, early_bird_offer_id: null })));
    const body = await (await call(issueDashboardToken(CODE))).json();
    expect(body.reg.discount_label).toBe("Discount code");
  });

  it("returns no label when no discount applied", async () => {
    mockDb.mockReturnValue(fakeDb(handlers()));
    const body = await (await call(issueDashboardToken(CODE))).json();
    expect(body.reg.discount_label).toBeNull();
  });

  it("falls back to 'Early bird' when the offer name cannot be read, and never returns the offer id", async () => {
    mockDb.mockReturnValue(fakeDb({
      ...handlers(EB_REG),
      it_run_early_bird_offers: () => ({ data: null, error: { code: "XX", message: "boom" } }),
    }));
    const res = await call(issueDashboardToken(CODE));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reg.discount_label).toBe("Early bird");
    expect(JSON.stringify(body)).not.toContain("offer-1");
    expect(body.reg.early_bird_offer_id).toBeUndefined();
  });
});
