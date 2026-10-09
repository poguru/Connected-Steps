/**
 * IT Run registration validation: email and date of birth.
 *
 *  - Unit tests for lib/it-run-validation (email rules, strict dates, calendar age, boundaries).
 *  - Route tests for POST /api/it-run/register: the server rejects invalid participants with
 *    field-level errors before any registration, capacity, or payment write.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake Supabase builder is intentionally loosely typed */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
  checkAndRecordEndpointLimit: jest.fn().mockResolvedValue({ limited: false, retryAfter: 0 }),
  getClientIp: () => "203.0.113.9",
}));
jest.mock("@/lib/it-run-email", () => ({
  sendItRunConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  sendItRunBibInviteEmail: jest.fn().mockResolvedValue(undefined),
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { POST as registerPost } from "@/app/api/it-run/register/route";
import {
  isValidEmail,
  normalizeEmail,
  parseCalendarDate,
  calendarAge,
  todayInIST,
  validateDateOfBirth,
  type CalendarDate,
} from "@/lib/it-run-validation";

// ── Email ───────────────────────────────────────────────────────────────────────

describe("isValidEmail", () => {
  it.each([
    "user@gmail.com",
    "first.last+tag@gmail.com",
    "priya.k@tcs.com",          // company domain
    "someone@outlook.in",        // other provider
    "x@sub.example.co.in",       // multi-label domain
    "  padded@gmail.com  ",      // surrounding whitespace is trimmed
  ])("accepts %s", email => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["no @", "abc"],
    ["long string without @", "a".repeat(300)],
    ["double @", "user@@gmail.com"],
    ["missing local part", "@gmail.com"],
    ["missing domain", "user@"],
    ["space inside", "us er@gmail.com"],
    ["no dot in domain", "user@localhost"],
    ["empty domain label", "user@domain..com"],
    ["leading hyphen label", "user@-x.com"],
    ["trailing hyphen label", "user@x-.com"],
    ["numeric TLD (IP-like)", "user@1.2.3.4"],
    ["single-letter TLD", "user@x.c"],
    ["leading dot in local", ".user@gmail.com"],
    ["trailing dot in local", "user.@gmail.com"],
    ["consecutive dots in local", "us..er@gmail.com"],
    ["local part over 64 chars", `${"a".repeat(65)}@gmail.com`],
    ["address over 254 chars (each part within its own limit)", `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.com`],
    ["non-string", 12345],
  ])("rejects %s", (_label, email) => {
    expect(isValidEmail(email as any)).toBe(false);
  });

  it("normalizes by trimming and lowercasing for storage and lookup", () => {
    expect(normalizeEmail("  User@Gmail.COM ")).toBe("user@gmail.com");
  });
});

// ── Dates ───────────────────────────────────────────────────────────────────────

describe("parseCalendarDate", () => {
  it("accepts real calendar dates, including leap days in leap years", () => {
    expect(parseCalendarDate("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseCalendarDate("2000-02-29")).toEqual({ year: 2000, month: 2, day: 29 });
  });

  it.each([
    ["2026-02-31", "impossible day (rolls over to March in Date)"],
    ["2025-02-29", "leap day in a non-leap year"],
    ["1900-02-29", "1900 is not a leap year"],
    ["2026-13-01", "month 13"],
    ["2026-00-10", "month 0"],
    ["2026-04-31", "April has 30 days"],
    ["17-08-2008", "wrong order"],
    ["2008/08/17", "wrong separator"],
    ["2008-8-7", "not zero-padded"],
    ["2008-08-17T00:00:00Z", "datetime, not a date"],
    ["", "empty"],
  ])("rejects %s (%s)", value => {
    expect(parseCalendarDate(value)).toBeNull();
  });
});

describe("calendarAge", () => {
  const onDate = (y: number, m: number, d: number): CalendarDate => ({ year: y, month: m, day: d });

  it("is one less until the birthday has occurred on the reference date", () => {
    expect(calendarAge(onDate(2008, 8, 17), onDate(2026, 8, 16))).toBe(17);
    expect(calendarAge(onDate(2008, 8, 17), onDate(2026, 8, 17))).toBe(18);
    expect(calendarAge(onDate(2008, 8, 17), onDate(2026, 8, 18))).toBe(18);
  });
});

describe("todayInIST", () => {
  it("uses the India calendar day, not UTC", () => {
    // 2026-10-08 20:00 UTC is already 2026-10-09 01:30 in India
    expect(todayInIST(new Date("2026-10-08T20:00:00Z"))).toEqual({ year: 2026, month: 10, day: 9 });
  });
});

// ── Date of birth policy ────────────────────────────────────────────────────────

const EVENT: CalendarDate = { year: 2026, month: 8, day: 17 };
const TODAY: CalendarDate = { year: 2026, month: 10, day: 9 };
const adult = (dob: unknown) => validateDateOfBirth(dob, { isChild: false, eventDate: EVENT, today: TODAY });
const child = (dob: unknown) => validateDateOfBirth(dob, { isChild: true, eventDate: EVENT, today: TODAY });

describe("validateDateOfBirth: adults (18+ on the event date)", () => {
  it("accepts a valid adult date of birth", () => {
    expect(adult("1990-05-10").ok).toBe(true);
  });

  it("accepts someone who turns 18 exactly on the event date", () => {
    expect(adult("2008-08-17").ok).toBe(true);
  });

  it("rejects someone who turns 18 the day after the event", () => {
    const r = adult("2008-08-18");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("adult_too_young");
  });

  it("rejects a leap-day birthday that is not yet 18 on the event date", () => {
    // Born 2008-02-29; on a non-leap-year event date of 2026-02-28 they are still 17
    const r = validateDateOfBirth("2008-02-29", { isChild: false, eventDate: { year: 2026, month: 2, day: 28 }, today: TODAY });
    expect(r.ok).toBe(false);
  });

  it("accepts a leap-day birthday once 18 on the event date", () => {
    expect(adult("2008-02-29").ok).toBe(true);
  });
});

describe("validateDateOfBirth: general", () => {
  it("rejects a future date of birth", () => {
    const r = adult("2026-10-10");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("future");
      expect(r.message).toBe("Date of birth cannot be in the future.");
    }
  });

  it("accepts a date of birth equal to today (not future), then applies the age rule", () => {
    const r = adult("2026-10-09");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("adult_too_young");
  });

  it("rejects dates before the supported minimum", () => {
    const r = adult("1899-12-31");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("before_minimum");
  });

  it("rejects impossible calendar dates instead of rolling them over", () => {
    expect(adult("2000-02-31").ok).toBe(false);
  });

  it("requires a value", () => {
    for (const v of [undefined, null, "", "   "]) {
      const r = adult(v);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("required");
    }
  });

  it("rejects malformed values", () => {
    const r = adult("17/08/2008");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("Please enter a valid date of birth.");
  });
});

describe("validateDateOfBirth: kid category child (10 or younger on the event date)", () => {
  it("accepts a child exactly 10 on the event date", () => {
    expect(child("2016-08-17").ok).toBe(true);
  });

  it("accepts a child who is 10 one day before their 11th birthday (birthday after event)", () => {
    expect(child("2016-08-18").ok).toBe(true);
  });

  it("rejects a child who turns 11 on the event date", () => {
    const r = child("2015-08-17");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("child_out_of_range");
      expect(r.message).toBe("Please check the age eligibility requirements for this category.");
    }
  });

  it("rejects a child born after the event date", () => {
    expect(child("2026-08-18").ok).toBe(false);
  });

  it("rejects a future child date of birth with the future message", () => {
    const r = child("2026-12-01");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("future");
  });
});

// ── Route: POST /api/it-run/register ────────────────────────────────────────────

type Result = { data: unknown; error: { code?: string; message: string } | null };

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

const CATEGORY_KID = {
  id: "cat-kid", event_id: "ev-1", name: "1.5K Run with Kid", category_type: "kid",
  price_rupees: 299, max_participants: null, is_active: true,
};
const CATEGORY_SOLO = { ...CATEGORY_KID, id: "cat-solo", name: "10K", category_type: "solo" };
const EVENT_ROW = { registration_closes_at: null, event_date: "2026-08-17" };

function adultParticipant(overrides: Record<string, unknown> = {}) {
  return {
    type: "adult", firstName: "Asha", lastName: "Rao", bibName: "Asha Rao",
    gender: "F", dob: "1990-05-10", email: "asha@example.com", mobile: "9876543210",
    bloodGroup: "O+", emergencyName: "Ravi", emergencyPhone: "9123456789",
    companyName: "Acme", employeeId: "E1", companyIdUrl: "", tshirtSize: "M",
    medicalConditions: "", foodPreference: "veg",
    ...overrides,
  };
}

function childParticipant(overrides: Record<string, unknown> = {}) {
  return {
    type: "child", firstName: "Kiran", lastName: "Rao", bibName: "Kiran",
    gender: "M", dob: "2017-01-01", email: "", mobile: "9876543210",
    bloodGroup: "O+", emergencyName: "", emergencyPhone: "", companyName: "",
    employeeId: "", companyIdUrl: "", tshirtSize: "7-8Y", medicalConditions: "", foodPreference: "veg",
    ...overrides,
  };
}

function postRegister(participants: unknown[], categoryId = "cat-kid") {
  return registerPost(new NextRequest("http://t/api/it-run/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ categoryId, couponId: null, participants }),
  }));
}

function dbFor(category: unknown) {
  return fakeDb({
    it_run_categories: () => ({ data: category, error: null }),
    it_run_events: () => ({ data: EVENT_ROW, error: null }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/it-run/register: server-side validation", () => {
  it("rejects an adult with an invalid email, with a field-level error", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(dbFor(CATEGORY_SOLO));

    const res = await postRegister([adultParticipant({ email: "user@@gmail.com" })], "cat-solo");
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.field).toBe("email");
    expect(body.participant_index).toBe(0);
    expect(body.error).toContain("valid email");
  });

  it("rejects an adult below 18 on the event date, with a dob field error", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(dbFor(CATEGORY_SOLO));

    const res = await postRegister([adultParticipant({ dob: "2008-08-18" })], "cat-solo");
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.field).toBe("dob");
    expect(body.error).toContain("at least 18");
  });

  it("rejects an impossible date of birth", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(dbFor(CATEGORY_SOLO));

    const res = await postRegister([adultParticipant({ dob: "2000-02-31" })], "cat-solo");
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.field).toBe("dob");
  });

  it("rejects a future date of birth", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(dbFor(CATEGORY_SOLO));

    const res = await postRegister([adultParticipant({ dob: "2999-01-01" })], "cat-solo");
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Participant: Date of birth cannot be in the future.");
  });

  it("validates every participant in a multi-participant booking and reports the failing index", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(dbFor(CATEGORY_KID));

    const res = await postRegister([
      adultParticipant(),
      childParticipant({ dob: "2015-08-17" }), // turns 11 on the event date
    ]);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.field).toBe("dob");
    expect(body.participant_index).toBe(1);
  });

  it("rejects a child with an invalid optional email, even though a child email is not required", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(dbFor(CATEGORY_KID));

    const res = await postRegister([
      adultParticipant(),
      childParticipant({ email: "not-an-email" }),
    ]);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.field).toBe("email");
    expect(body.participant_index).toBe(1);
  });

  it("does not require an email for a child, and accepts a valid parent and child", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(dbFor(CATEGORY_KID));

    const res = await postRegister([adultParticipant(), childParticipant()]);

    // Validation passes; the request then proceeds past validation. It must not be a field error.
    expect(res.status).not.toBe(400);
  });

  it("returns 503, not a guess, when the event has no usable event date", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb({
      it_run_categories: () => ({ data: CATEGORY_SOLO, error: null }),
      it_run_events: () => ({ data: { registration_closes_at: null, event_date: null }, error: null }),
    }));

    const res = await postRegister([adultParticipant()], "cat-solo");

    expect(res.status).toBe(503);
  });
});
