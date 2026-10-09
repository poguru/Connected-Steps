/**
 * Optional company ID for The IT Run Sprint-2.
 *  - A participant uploads an ID (pending review) or continues without one (not_provided).
 *  - Neither choice blocks registration. Not providing an ID is never a rejection or clarification.
 *  - Document references are validated on the server; the stored status is derived there.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */
import fs from "fs";
import path from "path";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({
  requireRole: jest.fn(),
  getClientIp: () => "203.0.113.3",
  generateRegistrationCode: () => "ITR-TEST",
  signItRunQR: () => "qr",
}));
jest.mock("@/lib/rate-limit", () => ({
  checkAndRecordEndpointLimit: jest.fn().mockResolvedValue({ limited: false, retryAfter: 0 }),
  getClientIp: () => "203.0.113.3",
}));
jest.mock("@/lib/it-run-email", () => ({
  sendItRunConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  sendItRunBibInviteEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/notify", () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";
import {
  isStoredDocumentPath,
  initialVerificationStatus,
  idChoiceError,
} from "@/lib/it-run-id-verification";
import { POST as registerPost } from "@/app/api/it-run/register/route";
import { GET as adminListGet, PATCH as adminDecisionPatch } from "@/app/api/it-run/admin/verification/route";

const mockDb = getSupabaseServer as jest.Mock;
const mockRole = requireRole as jest.Mock;
const ROOT = path.join(__dirname, "..", "..");

const UPLOADED = "1760000000000-k3j9x2a.jpg";
const RESUBMITTED = "resubmit-1760000000000-0f1e2d3c-4b5a-4968-8777-665544332211.pdf";

// ── Document references ────────────────────────────────────────────────────────

describe("isStoredDocumentPath", () => {
  it.each([UPLOADED, RESUBMITTED])("accepts a path our upload produced: %s", p => {
    expect(isStoredDocumentPath(p)).toBe(true);
  });

  it.each([
    ["an empty string", ""],
    ["the old sentinel", "error"],
    ["a URL", "https://evil.example.com/id.jpg"],
    ["a traversal", "../secrets/id.jpg"],
    ["a path with directories", "bucket/1760000000000-k3j9x2a.jpg"],
    ["a wrong extension", "1760000000000-k3j9x2a.exe"],
    ["null", null],
    ["an object", { path: UPLOADED }],
  ])("rejects %s", (_label, value) => {
    expect(isStoredDocumentPath(value as any)).toBe(false);
  });
});

// ── Status derivation ──────────────────────────────────────────────────────────

describe("the stored identity status comes from the document, not the client", () => {
  it("an adult with a stored document is pending review", () => {
    expect(initialVerificationStatus(false, UPLOADED)).toBe("pending");
  });

  it("an adult who continues without an ID is not_provided, never a rejection or clarification", () => {
    expect(initialVerificationStatus(false, "")).toBe("not_provided");
    expect(initialVerificationStatus(false, undefined)).toBe("not_provided");
    expect(initialVerificationStatus(false, "error")).toBe("not_provided");
  });

  it("a child is exempt and recorded as verified", () => {
    expect(initialVerificationStatus(true, "")).toBe("verified");
  });
});

// ── Client choice ──────────────────────────────────────────────────────────────

describe("the company step requires a choice, and neither choice blocks", () => {
  it("an adult with no choice cannot continue", () => {
    expect(idChoiceError({}, false)).toMatch(/Choose Upload ID or Continue Without ID/);
  });

  it("Continue Without ID can continue with no document", () => {
    expect(idChoiceError({ idChoice: "skip", companyIdUrl: "" }, false)).toBeNull();
  });

  it("Upload ID needs a finished upload before continuing", () => {
    expect(idChoiceError({ idChoice: "upload", companyIdUrl: "" }, false)).toMatch(/Upload your ID/);
    expect(idChoiceError({ idChoice: "upload", companyIdUrl: "error" }, false)).toMatch(/Upload your ID/);
    expect(idChoiceError({ idChoice: "upload", companyIdUrl: UPLOADED }, false)).toBeNull();
  });

  it("children never need a choice", () => {
    expect(idChoiceError({}, true)).toBeNull();
  });
});

// ── Registration API ───────────────────────────────────────────────────────────

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const CAT_ID = "22222222-2222-4222-8222-222222222222";

function registerFake() {
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

function adultBody(companyIdUrl: string) {
  return {
    categoryId: CAT_ID, couponId: null,
    participants: [{
      type: "solo", firstName: "Asha", lastName: "Rao", bibName: "ASHA", gender: "F",
      dob: "1990-05-10", email: "asha@example.com", mobile: "9876543210", bloodGroup: "O+",
      emergencyName: "Ravi", emergencyPhone: "9123456789", companyName: "Acme", employeeId: "E1",
      companyIdUrl, tshirtSize: "M", medicalConditions: "", foodPreference: "veg",
    }],
  };
}

function regReq(body: unknown) {
  return new NextRequest("http://t/api/it-run/register", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/it-run/register: company ID handling", () => {
  beforeEach(() => jest.clearAllMocks());

  it("refuses a document reference the server did not issue, and writes nothing", async () => {
    const fake = registerFake();
    mockDb.mockReturnValue(fake.db);

    const res = await registerPost(regReq(adultBody("https://evil.example.com/id.jpg")));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.field).toBe("companyIdUrl");
    expect(fake.inserts).toEqual([]);
  });

  it("does not reject a registration that continues without an ID (the field is simply empty)", async () => {
    const fake = registerFake();
    mockDb.mockReturnValue(fake.db);

    const res = await registerPost(regReq(adultBody("")));
    const json = await res.json();

    expect(json.field).not.toBe("companyIdUrl");
    expect(res.status).not.toBe(400);
  });
});

// ── Admin review ───────────────────────────────────────────────────────────────

function adminFake(participantRow: Record<string, unknown> | null) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const db = {
    from(table: string) {
      const b: any = {};
      const rec = (method: string) => (...args: unknown[]) => { calls.push({ table, method, args }); return b; };
      for (const m of ["select", "eq", "not", "is", "order", "range", "update", "insert"]) b[m] = rec(m);
      b.single = () => Promise.resolve({ data: { id: EVENT_ID, title: "The IT Run Sprint-2" }, error: null });
      b.maybeSingle = () => Promise.resolve({ data: participantRow, error: null });
      b.then = (res: (v: any) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: [], count: 0, error: null }).then(res, rej);
      return b;
    },
  };
  return { db, calls };
}

describe("admin verification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRole.mockReturnValue({ email: "admin@example.com", role: "event_admin" });
  });

  it("the not_provided tab lists participants with no document on file", async () => {
    const fake = adminFake(null);
    mockDb.mockReturnValue(fake.db);

    await adminListGet(new NextRequest("http://t/api/it-run/admin/verification?status=not_provided"));

    expect(fake.calls.some(c => c.method === "is" && c.args[0] === "company_id_url" && c.args[1] === null)).toBe(true);
    expect(fake.calls.some(c => c.method === "not")).toBe(false);
  });

  it("review tabs list only participants who have a document", async () => {
    const fake = adminFake(null);
    mockDb.mockReturnValue(fake.db);

    await adminListGet(new NextRequest("http://t/api/it-run/admin/verification?status=pending"));

    expect(fake.calls.some(c => c.method === "not" && c.args[0] === "company_id_url")).toBe(true);
  });

  it("approving or rejecting someone with no document is refused and nothing is written", async () => {
    const fake = adminFake({ email: "a@example.com", first_name: "Asha", company_id_url: null });
    mockDb.mockReturnValue(fake.db);

    const res = await adminDecisionPatch(new NextRequest("http://t/api/it-run/admin/verification", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ participantId: "p1", status: "rejected", reason: "unreadable_id" }),
    }));

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("NO_DOCUMENT");
    expect(fake.calls.some(c => c.table === "it_run_participants" && c.method === "update")).toBe(false);
  });
});

// ── Migration ──────────────────────────────────────────────────────────────────

describe("migration 20261010000003", () => {
  const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261010000003_id_not_provided.sql"), "utf8");

  it("adds not_provided to the allowed statuses", () => {
    expect(sql).toMatch(/CHECK \(verification_status IN \('not_provided', 'pending', 'verified', 'rejected', 'need_clarification'\)\)/);
  });

  it("only reclassifies rows with no document and no admin decision", () => {
    expect(sql).toMatch(/company_id_url IS NULL/);
    expect(sql).toMatch(/NOT EXISTS/);
    expect(sql).toMatch(/it_run_company_verifications/);
  });

  it("does not touch registrations, payments, QR tokens, or BIB data", () => {
    expect(sql).not.toMatch(/it_run_registrations|razorpay|qr_token|bib_number/i);
  });
});
