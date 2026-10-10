/**
 * A participant who continued without an ID adds one later: owner only, adults only, a valid stored path, and the
 * record moves to pending review with the chosen document type. Anything else changes nothing.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth", () => ({ verifyUserToken: jest.fn(), USER_SESSION_COOKIE: "cs_user_session" }));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { POST } from "@/app/api/it-run/my-registrations/id-document/route";

const mockDb = getSupabaseServer as jest.Mock;
const mockVerify = verifyUserToken as jest.Mock;

const OWNER = "asha@example.com";
const PATH = "1790000000000-abc123.pdf";

function fakeDb(opts: { part?: any; linked?: string | null; updated?: unknown[] } = {}) {
  const updates: any[] = [];
  const audits: any[] = [];
  const part = opts.part === undefined
    ? { id: "p-1", event_id: "ev-1", registration_id: "r-1", verification_status: "not_provided", company_id_url: null }
    : opts.part;
  return {
    updates, audits,
    from(table: string) {
      const b: any = {};
      let op = "select";
      for (const m of ["select", "eq", "is"]) b[m] = () => b;
      b.update = (p: any) => { op = "update"; updates.push(p); return b; };
      b.insert = (p: any) => { audits.push({ table, payload: p }); return Promise.resolve({ data: null, error: null }); };
      b.maybeSingle = () => {
        if (table === "it_run_participants") return Promise.resolve({ data: part, error: null });
        if (table === "it_run_registrations") return Promise.resolve({ data: { linked_user_email: opts.linked === undefined ? OWNER : opts.linked }, error: null });
        return Promise.resolve({ data: null, error: null });
      };
      b.then = (res: any, rej?: any) => {
        const data = op === "update" ? (opts.updated ?? [{ id: "p-1" }]) : [];
        return Promise.resolve({ data, error: null }).then(res, rej);
      };
      return b;
    },
  };
}

function req(body: unknown, token = "tok") {
  return new NextRequest("http://t/api/it-run/my-registrations/id-document", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `cs_user_session=${token}` },
    body: JSON.stringify(body),
  });
}

const GOOD = { participantId: "p-1", documentPath: PATH, documentType: "company" };

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockReturnValue(OWNER);
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("POST /api/it-run/my-registrations/id-document", () => {
  it("refuses an unsigned request, and changes nothing", async () => {
    mockVerify.mockReturnValue(null);
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await POST(req(GOOD, "bad"));
    expect(res.status).toBe(401);
    expect(db.updates).toEqual([]);
  });

  it("refuses a participant on another account with the same 404 as a missing one", async () => {
    mockDb.mockReturnValue(fakeDb({ linked: "someone@else.com" }));
    const other = await POST(req(GOOD));
    mockDb.mockReturnValue(fakeDb({ part: null }));
    const missing = await POST(req(GOOD));
    expect(other.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await other.text()).toBe(await missing.text());
  });

  it("refuses a participant who already has an ID on file (use the replacement link)", async () => {
    const db = fakeDb({ part: { id: "p-1", event_id: "ev-1", registration_id: "r-1", verification_status: "pending", company_id_url: "x" } });
    mockDb.mockReturnValue(db);
    const res = await POST(req(GOOD));
    expect(res.status).toBe(409);
    expect(db.updates).toEqual([]);
  });

  it("refuses a child, who is verified without an ID and is exempt", async () => {
    const db = fakeDb({ part: { id: "p-1", event_id: "ev-1", registration_id: "r-1", verification_status: "verified", company_id_url: null } });
    mockDb.mockReturnValue(db);
    const res = await POST(req(GOOD));
    expect(res.status).toBe(409);
    expect(db.updates).toEqual([]);
  });

  it("refuses a path that is not a stored document", async () => {
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await POST(req({ ...GOOD, documentPath: "https://evil.example/x.pdf" }));
    expect(res.status).toBe(400);
    expect(db.updates).toEqual([]);
  });

  it("attaches a company ID and sends the record to pending review", async () => {
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const res = await POST(req(GOOD));
    expect(res.status).toBe(200);
    expect(db.updates[0]).toMatchObject({ company_id_url: PATH, id_document_type: "company", verification_status: "pending" });
  });

  it("records a government ID as government, not company", async () => {
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    await POST(req({ ...GOOD, documentType: "government" }));
    expect(db.updates[0]).toMatchObject({ id_document_type: "government", verification_status: "pending" });
  });

  it("treats an unknown document type as company", async () => {
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    await POST(req({ ...GOOD, documentType: "passport-override" }));
    expect(db.updates[0].id_document_type).toBe("company");
  });

  it("returns 409 when a concurrent change means nothing was updated", async () => {
    mockDb.mockReturnValue(fakeDb({ updated: [] }));
    const res = await POST(req(GOOD));
    expect(res.status).toBe(409);
  });

  it("records an audit entry with the document type, never the path", async () => {
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    await POST(req(GOOD));
    const audit = db.audits.find(a => a.table === "it_run_audit_logs");
    expect(audit?.payload.action).toBe("id_document_added");
    expect(JSON.stringify(audit?.payload)).not.toContain(PATH);
  });
});
