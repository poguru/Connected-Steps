/**
 * Admin verification list: every eligible participant is listed for the chosen status, whether or not a document
 * was uploaded. The query must not depend on a document existing (that hid children and participants who
 * continued without an ID).
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({ requireRole: jest.fn(), getClientIp: () => "203.0.113.1" }));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";
import { GET } from "@/app/api/it-run/admin/verification/route";

const mockDb = getSupabaseServer as jest.Mock;
const mockRole = requireRole as jest.Mock;

/** Records every filter applied to the participants query and returns the given rows. */
function fakeDb(rows: unknown[]) {
  const filters: Array<{ method: string; args: unknown[] }> = [];
  return {
    filters,
    from(table: string) {
      const b: any = {};
      const rec = (method: string) => (...args: unknown[]) => { filters.push({ method, args }); return b; };
      for (const m of ["select", "eq", "is", "not", "order", "range"]) b[m] = rec(m);
      b.single = () => Promise.resolve({ data: { id: "ev-1" }, error: null });
      b.then = (res: any, rej?: any) => Promise.resolve({ data: table === "it_run_participants" ? rows : [], error: null, count: rows.length }).then(res, rej);
      return b;
    },
  };
}

function req(status?: string) {
  const qs = status ? `?status=${status}` : "";
  return new NextRequest(`http://t/api/it-run/admin/verification${qs}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRole.mockReturnValue({ email: "admin@example.com", role: "event_admin" });
});

describe("admin verification list", () => {
  it("never filters by whether a document exists", async () => {
    const db = fakeDb([]);
    mockDb.mockReturnValue(db);
    await GET(req("verified"));
    expect(db.filters.some(f => f.method === "not" || f.method === "is")).toBe(false);
  });

  it("returns a child who is verified without a document", async () => {
    const child = { id: "p-child", first_name: "Ravi", verification_status: "verified", company_id_url: null, it_run_registrations: { registration_code: "ITR-1" } };
    mockDb.mockReturnValue(fakeDb([child]));
    const body = await (await GET(req("verified"))).json();
    expect(body.data.map((r: any) => r.id)).toEqual(["p-child"]);
  });

  it("lists a participant who continued without an ID under Not Provided", async () => {
    const noId = { id: "p-noid", verification_status: "not_provided", company_id_url: null, it_run_registrations: { registration_code: "ITR-2" } };
    const db = fakeDb([noId]);
    mockDb.mockReturnValue(db);
    const body = await (await GET(req("not_provided"))).json();
    expect(body.data.map((r: any) => r.id)).toEqual(["p-noid"]);
    expect(db.filters).toContainEqual({ method: "eq", args: ["verification_status", "not_provided"] });
  });

  it("the All view applies no status filter, so every participant is listed", async () => {
    const db = fakeDb([]);
    mockDb.mockReturnValue(db);
    await GET(req("all"));
    expect(db.filters.some(f => f.method === "eq" && f.args[0] === "verification_status")).toBe(false);
  });

  it("the registration is read without an inner join, so no participant is dropped", async () => {
    mockDb.mockReturnValue(fakeDb([]));
    await GET(req("all"));
    const src = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "app/api/it-run/admin/verification/route.ts"), "utf8");
    expect(src).not.toMatch(/!inner/);
  });

  it("refuses an unauthorised caller", async () => {
    mockRole.mockReturnValue(null);
    mockDb.mockReturnValue(fakeDb([]));
    const res = await GET(req("all"));
    expect(res.status).toBe(401);
  });
});
