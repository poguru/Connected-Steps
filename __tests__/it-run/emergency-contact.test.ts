/**
 * Emergency contact and mobile rules, and the date-of-birth picker bounds.
 *
 *  - Unit tests for the shared phone rules (lib/it-run-validation), used by both the form and the API.
 *  - Route tests for POST /api/it-run/register: an emergency contact equal to the participant's mobile is rejected
 *    with the participant's index, so the wizard can return to that participant's details step.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake Supabase builder is intentionally loosely typed */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
  checkAndRecordEndpointLimit: jest.fn().mockResolvedValue({ limited: false, retryAfter: 0 }),
  getClientIp: () => "203.0.113.10",
}));
jest.mock("@/lib/it-run-email", () => ({
  sendItRunConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  sendItRunBibInviteEmail: jest.fn().mockResolvedValue(undefined),
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { POST as registerPost } from "@/app/api/it-run/register/route";
import {
  normalizeIndianPhone,
  normalizeIndianPhoneInput,
  emergencyMatchesMobile,
  formatCalendarDate,
  todayInIST,
} from "@/lib/it-run-validation";

// ── Phone: the shared rule ──────────────────────────────────────────────────────

describe("normalizeIndianPhone", () => {
  it("accepts a bare 10-digit number", () => {
    expect(normalizeIndianPhone("9876543210")).toBe("9876543210");
  });

  it("accepts the same number with a +91 prefix, with spaces or hyphens", () => {
    expect(normalizeIndianPhone("+91 98765 43210")).toBe("9876543210");
    expect(normalizeIndianPhone("+91-98765-43210")).toBe("9876543210");
    expect(normalizeIndianPhone("919876543210")).toBe("9876543210");
  });

  it("rejects numbers that are not 10 digits after the country code is removed", () => {
    expect(normalizeIndianPhone("98765")).toBeNull();
    expect(normalizeIndianPhone("09876543210")).toBeNull();
    expect(normalizeIndianPhone("")).toBeNull();
    expect(normalizeIndianPhone(undefined)).toBeNull();
  });
});

describe("emergencyMatchesMobile", () => {
  it("is false when the emergency contact is a different number", () => {
    expect(emergencyMatchesMobile("9876543210", "9123456789")).toBe(false);
  });

  it("is true when the numbers are identical", () => {
    expect(emergencyMatchesMobile("9876543210", "9876543210")).toBe(true);
  });

  it("is true when the same number is entered with and without +91", () => {
    expect(emergencyMatchesMobile("9876543210", "+91 98765 43210")).toBe(true);
    expect(emergencyMatchesMobile("+91-98765-43210", "9876543210")).toBe(true);
  });

  it("is false when either side is not a valid number, leaving that to the format check", () => {
    expect(emergencyMatchesMobile("9876543210", "")).toBe(false);
    expect(emergencyMatchesMobile("", "")).toBe(false);
  });
});

describe("normalizeIndianPhoneInput (what the phone input keeps while typing)", () => {
  it("keeps digits and stops at ten", () => {
    expect(normalizeIndianPhoneInput("98765 43210 99")).toBe("9876543210");
  });

  it("drops a +91 prefix typed in full, instead of keeping the first ten digits of it", () => {
    expect(normalizeIndianPhoneInput("+91 9876543210")).toBe("9876543210");
  });

  it("keeps a real number that starts with 91 when it is exactly ten digits", () => {
    expect(normalizeIndianPhoneInput("9123456789")).toBe("9123456789");
  });
});

// ── Date picker bounds ──────────────────────────────────────────────────────────

describe("date-of-birth picker bounds", () => {
  it("formats the IST day as YYYY-MM-DD for the calendar's max", () => {
    // 2026-10-09 23:30 UTC is already 2026-10-10 in India
    const now = new Date("2026-10-09T23:30:00Z");
    expect(formatCalendarDate(todayInIST(now))).toBe("2026-10-10");
  });

  it("pads single-digit months and days", () => {
    expect(formatCalendarDate({ year: 1900, month: 1, day: 1 })).toBe("1900-01-01");
  });
});

// ── Server: POST /api/it-run/register ───────────────────────────────────────────

type Result = { data: unknown; error: unknown };

function fakeDb(handlers: Record<string, () => Result>) {
  return {
    from(table: string) {
      const b: any = {
        select() { return b; },
        eq() { return b; },
        insert() { return b; },
        update() { return b; },
        single() { return run(); },
        maybeSingle() { return run(); },
        then(res: (v: Result) => unknown, rej?: (e: unknown) => unknown) { return run().then(res, rej); },
      };
      function run() {
        return Promise.resolve(handlers[table] ? handlers[table]() : { data: null, error: null });
      }
      return b;
    },
    rpc() { return Promise.resolve({ data: null, error: null }); },
  };
}

const CATEGORY_SOLO = {
  id: "cat-solo", event_id: "ev-1", name: "10K", category_type: "solo",
  price_rupees: 999, max_participants: null, is_active: true,
};
const EVENT_ROW = { registration_closes_at: null, event_date: "2026-08-17" };

function adult(overrides: Record<string, unknown> = {}) {
  return {
    type: "adult", firstName: "Asha", lastName: "Rao", bibName: "Asha Rao",
    gender: "F", dob: "1990-05-10", email: "asha@example.com", mobile: "9876543210",
    bloodGroup: "O+", emergencyName: "Ravi", emergencyPhone: "9123456789",
    companyName: "Acme", employeeId: "E1", companyIdUrl: "", tshirtSize: "M",
    medicalConditions: "", foodPreference: "veg",
    ...overrides,
  };
}

function post(participants: unknown[]) {
  return registerPost(new NextRequest("http://t/api/it-run/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ categoryId: "cat-solo", couponId: null, participants }),
  }));
}

function dbFor() {
  return fakeDb({
    it_run_categories: () => ({ data: CATEGORY_SOLO, error: null }),
    it_run_events: () => ({ data: EVENT_ROW, error: null }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/it-run/register: emergency contact", () => {
  it("rejects an emergency contact equal to the participant's mobile, with the field and participant", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(dbFor());
    const res = await post([adult({ emergencyPhone: "9876543210" })]);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.field).toBe("emergencyPhone");
    expect(body.participant_index).toBe(0);
    expect(body.error).toMatch(/different from your mobile number/);
  });

  it("rejects the same number written with +91 against the bare mobile", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(dbFor());
    const res = await post([adult({ mobile: "9876543210", emergencyPhone: "+91 98765 43210" })]);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.field).toBe("emergencyPhone");
  });

  it("does not reject a different number, even when formatted with +91", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(dbFor());
    const res = await post([adult({ mobile: "9876543210", emergencyPhone: "+91 91234 56789" })]);
    const body = await res.json();
    expect(body.field).not.toBe("emergencyPhone");
  });

  it("names the second participant when only their emergency contact is invalid", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(dbFor());
    const second = adult({ firstName: "Meera", mobile: "9000011111", emergencyPhone: "9000011111" });
    const res = await post([adult(), second]);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.field).toBe("emergencyPhone");
    expect(body.participant_index).toBe(1);
    expect(body.error).toMatch(/^Participant 2:/);
  });

  it("rejects an invalid participant mobile with a mobile field error", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(dbFor());
    const res = await post([adult({ mobile: "98765" })]);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.field).toBe("mobile");
  });

  it("rejects an invalid emergency contact number with an emergencyPhone field error", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(dbFor());
    const res = await post([adult({ emergencyPhone: "12345" })]);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.field).toBe("emergencyPhone");
  });
});
