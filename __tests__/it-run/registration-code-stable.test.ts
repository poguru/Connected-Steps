jest.mock("@/lib/it-run-category-cancel", () => ({
  cancelRunnerCategory: jest.fn().mockResolvedValue({ status: "cancelled", refundRequestId: "rr-1", refundPaise: 9000, runners: 1, categoryName: "5K Fun Run" }),
  CATEGORY_REFUND_PERCENT: 90,
}));
/**
 * The registration ID is assigned when the registration is created and stays the same for its whole life: whether the
 * ID is pending, verified, rejected, or refused, and after an ID-failure refund cancels the registration. Verification
 * and refund changes never write a new code.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake Supabase builder is intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({
  requireRole: jest.fn(),
  getClientIp: () => "203.0.113.40",
}));
jest.mock("@/lib/it-run-confirmation", () => ({
  confirmIfVerified: jest.fn().mockResolvedValue("waiting"),
  sendConfirmedNotices: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/after-response", () => ({ runAfterResponse: jest.fn() }));
jest.mock("@/lib/notify", () => ({ sendEmail: jest.fn().mockResolvedValue({ ok: true }) }));
jest.mock("@/lib/it-run-company-id-link", () => ({
  buildCompanyIdCorrectionUrl: jest.fn(() => "https://example.test/correct"),
}));

import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";
import { PATCH } from "@/app/api/it-run/admin/verification/route";

const CODE = "ITR-K7M2QX";

/** Records every write, so the test can prove none of them touches the registration code. */
function fakeDb() {
  const writes: Array<{ table: string; payload: any }> = [];
  return {
    writes,
    from(table: string) {
      const b: any = {};
      b.select = () => b;
      b.eq = () => b;
      b.is = () => b;
      b.single = () => Promise.resolve({ data: { id: "ev-1", title: "The IT Run", slug: "sprint-2" }, error: null });
      b.maybeSingle = () => Promise.resolve({
        data: {
          email: "asha@example.com", first_name: "Asha", company_id_url: "1760000000000-doc1.jpg",
          id_document_type: "company", registration_id: "r-1",
        },
        error: null,
      });
      b.update = (p: any) => { writes.push({ table, payload: p }); return b; };
      b.insert = (p: any) => { writes.push({ table, payload: p }); return Promise.resolve({ data: null, error: null }); };
      b.then = (res: any, rej?: any) => Promise.resolve({ data: null, error: null }).then(res, rej);
      return b;
    },
  };
}

function review(status: string, extra: Record<string, unknown> = {}) {
  return PATCH(new NextRequest("http://t/api/it-run/admin/verification", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ participantId: "p-1", status, ...extra }),
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  (requireRole as jest.Mock).mockReturnValue({ email: "verifier@example.com", role: "event_admin" });
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("registration ID is stable through verification", () => {
  it("verifying an ID does not write a registration code", async () => {
    const db = fakeDb();
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await review("verified");
    expect(res.status).toBe(200);
    const text = JSON.stringify(db.writes);
    expect(text).not.toContain("registration_code");
    expect(text).not.toContain(CODE);
  });

  it("rejecting an ID keeps the registration ID; the reason is recorded", async () => {
    const db = fakeDb();
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await review("rejected", {
      reason: "unreadable_id",
      adminExplanation: "The photo is too blurry to read the company name.",
    });
    expect(res.status).toBe(200);
    expect(db.writes.some(w => w.table === "it_run_participants" && w.payload.verification_status === "rejected")).toBe(true);
    expect(JSON.stringify(db.writes)).not.toContain("registration_code");
  });

  it("a clarification request keeps the registration ID", async () => {
    const db = fakeDb();
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await review("need_clarification", {
      reason: "clarification_needed",
      adminExplanation: "Please upload the other side of the card.",
    });
    expect(res.status).toBe(200);
    expect(JSON.stringify(db.writes)).not.toContain("registration_code");
  });
});

describe("the registration ID is assigned at creation, whatever the ID status", () => {
  it("the register route stores one code on the registration row and does not regenerate it", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/api/it-run/register/route.ts"), "utf8");
    // Created once per registration, and written into the registration row
    expect(source.match(/generateRegistrationCode\(\)/g)?.length).toBe(1);
    expect(source).toMatch(/registration_code:\s*regCode/);
  });

  it("no route writes a registration code in an update", () => {
    const offenders: string[] = [];
    // Every .update({ ... }) argument in the IT Run API, checked for a registration_code field
    const UPDATE_ARG = /\.update\(\{[^}]*\}\)/g;
    const walk = (dir: string) => {
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".ts")) {
          const text = fs.readFileSync(p, "utf8");
          const updates = text.match(UPDATE_ARG) ?? [];
          if (updates.some((u: string) => /registration_code/.test(u))) offenders.push(p);
        }
      }
    };
    walk(path.join(process.cwd(), "app/api/it-run"));
    expect(offenders).toEqual([]);
  });
});
