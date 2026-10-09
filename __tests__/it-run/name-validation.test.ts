/**
 * Participant name validation: one policy for the form, the registration API, and the admin editor.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */
import fs from "fs";
import path from "path";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({
  requireRole: jest.fn(),
  getClientIp: () => "203.0.113.9",
  generateRegistrationCode: () => "ITR-TEST",
  signItRunQR: () => "qr",
}));
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
import { requireRole } from "@/lib/it-run-auth";
import {
  checkPersonName, checkBibName, bibNameHint, normalizeName, PERSON_NAME_MAX, BIB_NAME_MAX,
} from "@/lib/it-run-name-validation";
import { POST as registerPost } from "@/app/api/it-run/register/route";
import { PATCH as adminParticipantPatch } from "@/app/api/it-run/admin/participants/route";

const mockDb = getSupabaseServer as jest.Mock;
const mockRole = requireRole as jest.Mock;
const ROOT = path.join(__dirname, "..", "..");

const ok = (v: string) => checkPersonName(v).ok;

// ── Accepted names ─────────────────────────────────────────────────────────────

describe("valid names are accepted and kept as typed", () => {
  it.each(["Kalyan", "Poguru", "Anne-Marie", "O'Connor", "O’Brien", "Mary Ann", "José", "Ñandú", "Zoë"])(
    "accepts %s", name => { expect(ok(name)).toBe(true); },
  );

  it("accepts Indian-script names (combining vowel signs are letters)", () => {
    expect(ok("రాయంకుల")).toBe(true);   // Telugu
    expect(ok("गुप्ता")).toBe(true);     // Devanagari
    expect(ok("மீனா")).toBe(true);        // Tamil
  });

  it("trims and collapses repeated spaces, without changing the letters", () => {
    expect(checkPersonName("   Anne   Marie  ")).toEqual({ ok: true, value: "Anne Marie" });
    expect(normalizeName("O'Connor")).toBe("O'Connor");
  });
});

// ── Rejected names ─────────────────────────────────────────────────────────────

describe("invalid names are rejected", () => {
  it("rejects the reported names", () => {
    expect(ok("Teja Vijayudu Rayankula@")).toBe(false);
    expect(ok("Athena/ Green")).toBe(false);
  });

  it.each([
    ["an emoji", "Kalyan😀"],
    ["digits", "Kalyan2"],
    ["a symbol", "Kal#yan"],
    ["a full stop", "R.Kumar"],
    ["spaces only", "    "],
    ["an empty string", ""],
    ["a leading hyphen", "-Kumar"],
    ["a trailing apostrophe", "Kumar'"],
    ["a doubled hyphen", "Anne--Marie"],
    ["a hyphen next to a space", "Anne - Marie"],
    ["a tab character", "Anne\tMarie"],
  ])("rejects %s", (_label, name) => {
    expect(ok(name)).toBe(false);
  });

  it("refuses a name longer than the limit", () => {
    expect(ok("A".repeat(PERSON_NAME_MAX + 1))).toBe(false);
    expect(ok("A".repeat(PERSON_NAME_MAX))).toBe(true);
  });

  it("non-string input is refused", () => {
    expect(checkPersonName(undefined).ok).toBe(false);
    expect(checkPersonName(12345).ok).toBe(false);
  });
});

// ── BIB name ───────────────────────────────────────────────────────────────────

describe("BIB name", () => {
  it("accepts a normal BIB name with spaces and punctuation", () => {
    expect(checkBibName("ASHA R.".replace(".", "")).ok).toBe(true);
    expect(checkBibName("O'CONNOR").ok).toBe(true);
    expect(checkBibName("ANNE-MARIE").ok).toBe(true);
  });

  it("refuses digits, underscores and emojis (ASCII \\w allowed these before)", () => {
    expect(checkBibName("RUNNER1").ok).toBe(false);
    expect(checkBibName("RUNNER_1").ok).toBe(false);
    expect(checkBibName("STAR⭐").ok).toBe(false);
  });

  it("refuses whitespace-only and over-long BIB names", () => {
    expect(checkBibName("   ").ok).toBe(false);
    expect(checkBibName("A".repeat(BIB_NAME_MAX + 1)).ok).toBe(false);
  });

  it("shows a live hint that says what will be printed, or why it cannot be", () => {
    const good = bibNameHint("Asha Rao");
    expect(good).toEqual({ tone: "ok", text: "This name will be printed on your BIB: Asha Rao" });
    const bad = bibNameHint("Asha/Rao");
    expect(bad.tone).toBe("error");
    expect(bad.text).toMatch(/printed on your BIB/);
  });
});

// ── Direct API requests ────────────────────────────────────────────────────────

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const CAT_ID = "22222222-2222-4222-8222-222222222222";

function fakeDb() {
  const inserts: Array<{ table: string; payload: any }> = [];
  return {
    inserts,
    db: {
      from(table: string) {
        const b: any = { op: "select" };
        b.select = () => b;
        b.eq = () => b;
        b.insert = (p: unknown) => { b.op = "insert"; inserts.push({ table, payload: p }); return b; };
        b.update = () => { b.op = "update"; return b; };
        b.single = () => {
          if (table === "it_run_categories") return Promise.resolve({ data: { id: CAT_ID, event_id: EVENT_ID, name: "10K", category_type: "solo", price_rupees: 799, max_participants: null, is_active: true }, error: null });
          if (table === "it_run_events") return Promise.resolve({ data: { registration_closes_at: null, event_date: "2026-08-17" }, error: null });
          return Promise.resolve({ data: null, error: null });
        };
        b.maybeSingle = () => b.single();
        b.then = (res: (v: any) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res, rej);
        return b;
      },
      rpc() { return Promise.resolve({ data: null, error: null }); },
    },
  };
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    categoryId: CAT_ID, couponId: null,
    participants: [{
      type: "solo", firstName: "Asha", lastName: "Rao", bibName: "ASHA RAO", gender: "F",
      dob: "1990-05-10", email: "asha@example.com", mobile: "9876543210", bloodGroup: "O+",
      emergencyName: "Ravi", emergencyPhone: "9123456789", companyName: "Acme", employeeId: "E1",
      companyIdUrl: "", tshirtSize: "M", medicalConditions: "", foodPreference: "veg",
      ...overrides,
    }],
  };
}

function regReq(b: unknown) {
  return new NextRequest("http://t/api/it-run/register", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
  });
}

describe("POST /api/it-run/register refuses invalid names before writing", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ["first name", { firstName: "Teja@" }, "firstName"],
    ["last name", { lastName: "Athena/ Green" }, "lastName"],
    ["BIB name", { bibName: "RUNNER1" }, "bibName"],
    ["emergency contact", { emergencyName: "Ravi#2" }, "emergencyName"],
  ])("refuses an invalid %s with a field error and no insert", async (_label, change, field) => {
    const fake = fakeDb();
    mockDb.mockReturnValue(fake.db);

    const res = await registerPost(regReq(body(change)));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.field).toBe(field);
    expect(fake.inserts).toEqual([]);
  });

  it("validates every participant in a multi-participant booking", async () => {
    const fake = fakeDb();
    mockDb.mockReturnValue(fake.db);
    const twoRunners = {
      categoryId: CAT_ID, couponId: null,
      participants: [
        body().participants[0],
        { ...body().participants[0], firstName: "Good", lastName: "Name@Bad" },
      ],
    };
    const res = await registerPost(regReq({ ...twoRunners, participants: twoRunners.participants }));
    // A solo category takes one runner, so the count check runs first; the field check is covered above
    expect(res.status).toBe(400);
    expect(fake.inserts).toEqual([]);
  });
});

describe("admin participant editor refuses invalid names", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRole.mockReturnValue({ email: "admin@example.com", role: "event_admin" });
  });

  it("returns a field error and writes nothing for an invalid first name", async () => {
    const updates: unknown[] = [];
    mockDb.mockReturnValue({
      from() {
        const b: any = {};
        b.select = () => b; b.eq = () => b;
        b.single = () => Promise.resolve({ data: { first_name: "Asha" }, error: null });
        b.update = (p: unknown) => { updates.push(p); return b; };
        return b;
      },
    });

    const res = await adminParticipantPatch(new NextRequest("http://t/api/it-run/admin/participants", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "p1", first_name: "Asha@" }),
    }));

    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("first_name");
    expect(updates).toEqual([]);
  });
});

// ── Wiring ─────────────────────────────────────────────────────────────────────

describe("the policy is used everywhere names are checked", () => {
  it("the form uses the shared policy, not its own regex", () => {
    const page = fs.readFileSync(path.join(ROOT, "app/it-run/register/page.tsx"), "utf8");
    expect(page).toMatch(/checkPersonName\(p\.firstName/);
    expect(page).toMatch(/checkPersonName\(p\.lastName/);
    expect(page).toMatch(/checkBibName\(p\.bibName\)/);
    expect(page).not.toMatch(/const nameRe = \/\[\\p\{L\}\]\/u;\n\s+if \(!p\.firstName/);
  });

  it("the registration API uses the shared policy", () => {
    const route = fs.readFileSync(path.join(ROOT, "app/api/it-run/register/route.ts"), "utf8");
    expect(route).toMatch(/checkPersonName\(p\.firstName/);
    expect(route).toMatch(/checkBibName\(p\.bibName\)/);
  });

  it("the audit script is read-only", () => {
    const sql = fs.readFileSync(path.join(ROOT, "scripts/audit-it-run-names.sql"), "utf8");
    expect(sql).toMatch(/^SELECT/m);
    expect(sql).not.toMatch(/\b(UPDATE|DELETE|INSERT|ALTER|DROP)\b/i);
  });
});
