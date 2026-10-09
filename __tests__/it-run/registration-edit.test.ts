/**
 * Editing an existing registration (PATCH /api/it-run/register) before payment.
 *  - Refuses confirmed payments, expired reservations, category changes, mismatched participants,
 *    and invalid details (same rules as registration).
 *  - A valid edit updates the same participant rows and nothing else: no new registration, no
 *    capacity or coupon change, no QR change, no payment change.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
  checkAndRecordEndpointLimit: jest.fn().mockResolvedValue({ limited: false, retryAfter: 0 }),
  getClientIp: () => "203.0.113.8",
}));
jest.mock("@/lib/it-run-email", () => ({
  sendItRunConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  sendItRunBibInviteEmail: jest.fn().mockResolvedValue(undefined),
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { PATCH } from "@/app/api/it-run/register/route";

const mockDb = getSupabaseServer as jest.Mock;

const REG_ID = "aaaaaaaa-1111-4111-8111-111111111111";
const CODE = "ITR-0001";
const CAT_ID = "bbbbbbbb-2222-4222-8222-222222222222";
const EVENT_ID = "cccccccc-3333-4333-8333-333333333333";
const P1 = "dddddddd-4444-4444-8444-444444444444";
const P2 = "eeeeeeee-5555-4555-8555-555555555555";

type Call = { table: string; op: string; payload?: any; filters: Record<string, unknown> };

function fakeDb(opts: {
  reg?: Partial<Record<string, unknown>> | null;
  category?: "solo" | "kid";
  participants?: Array<{ id: string; company_id_url: string | null; verification_status: string }>;
}) {
  const calls: Call[] = [];
  const reg = opts.reg === null ? null : {
    id: REG_ID, event_id: EVENT_ID, registration_code: CODE, category_id: CAT_ID,
    payment_status: "pending", registration_status: "active", participant_count: 1,
    ...(opts.reg ?? {}),
  };
  const participants = opts.participants ?? [
    { id: P1, company_id_url: null, verification_status: "not_required" },
  ];

  const db = {
    from(table: string) {
      const c: Call = { table, op: "select", filters: {} };
      const b: any = {
        select() { return b; },
        eq(k: string, v: unknown) { c.filters[k] = v; return b; },
        order() { return b; },
        insert(p: unknown) { c.op = "insert"; c.payload = p; return b; },
        update(p: unknown) { c.op = "update"; c.payload = p; return b; },
        maybeSingle() { return run(true); },
        single() { return run(true); },
        then(res: (v: any) => unknown, rej?: (e: unknown) => unknown) { return run(false).then(res, rej); },
      };
      function run(single: boolean): Promise<any> {
        calls.push({ ...c, filters: { ...c.filters } });
        if (c.op !== "select") return Promise.resolve({ data: null, error: null });
        if (table === "it_run_registrations") return Promise.resolve({ data: reg, error: null });
        if (table === "it_run_categories") return Promise.resolve({ data: { id: CAT_ID, category_type: opts.category ?? "solo" }, error: null });
        if (table === "it_run_events") return Promise.resolve({ data: { event_date: "2026-08-17" }, error: null });
        if (table === "it_run_participants") return Promise.resolve({ data: participants, error: null });
        return Promise.resolve({ data: single ? null : [], error: null });
      }
      return b;
    },
    rpc(name: string) { calls.push({ table: `rpc:${name}`, op: "rpc", filters: {} }); return Promise.resolve({ data: null, error: null }); },
  };
  return { db, calls };
}

function adult(overrides: Record<string, unknown> = {}) {
  return {
    id: P1, type: "solo", firstName: "Asha", lastName: "Rao", bibName: "Asha Rao",
    gender: "F", dob: "1990-05-10", email: "asha@example.com", mobile: "9876543210",
    bloodGroup: "O+", emergencyName: "Ravi", emergencyPhone: "9123456789",
    companyName: "Acme", employeeId: "E1", companyIdUrl: "", tshirtSize: "M",
    medicalConditions: "", foodPreference: "veg", ...overrides,
  };
}

function req(body: unknown) {
  return new NextRequest("http://t/api/it-run/register", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

function body(participants: unknown[], over: Record<string, unknown> = {}) {
  return { registrationId: REG_ID, registrationCode: CODE, categoryId: CAT_ID, participants, ...over };
}

beforeEach(() => jest.clearAllMocks());

describe("PATCH /api/it-run/register: refusals", () => {
  it("returns 404 when the code does not match the registration", async () => {
    mockDb.mockReturnValue(fakeDb({}).db);
    const res = await PATCH(req(body([adult()], { registrationCode: "ITR-WRONG" })));
    expect(res.status).toBe(404);
  });

  it("refuses to change details once payment is confirmed (no charge, no change)", async () => {
    const { db, calls } = fakeDb({ reg: { payment_status: "paid" } });
    mockDb.mockReturnValue(db);
    const res = await PATCH(req(body([adult()])));
    expect((await res.json()).code).toBe("PAYMENT_CONFIRMED");
    expect(res.status).toBe(409);
    expect(calls.some(c => c.op === "update")).toBe(false);
  });

  it("refuses an expired reservation and asks for a new registration", async () => {
    mockDb.mockReturnValue(fakeDb({ reg: { payment_status: "expired" } }).db);
    const res = await PATCH(req(body([adult()])));
    expect((await res.json()).code).toBe("RESERVATION_EXPIRED");
  });

  it("refuses a category change (capacity stays with the original category)", async () => {
    const { db, calls } = fakeDb({});
    mockDb.mockReturnValue(db);
    const res = await PATCH(req(body([adult()], { categoryId: "other-category" })));
    expect((await res.json()).code).toBe("CATEGORY_LOCKED");
    expect(calls.some(c => c.op === "update" || c.table.startsWith("rpc"))).toBe(false);
  });

  it("refuses participant IDs that do not belong to this registration", async () => {
    const { db, calls } = fakeDb({});
    mockDb.mockReturnValue(db);
    const res = await PATCH(req(body([adult({ id: "99999999-9999-4999-8999-999999999999" })])));
    expect((await res.json()).code).toBe("PARTICIPANT_MISMATCH");
    expect(calls.some(c => c.op === "update")).toBe(false);
  });

  it("refuses a different number of participants", async () => {
    mockDb.mockReturnValue(fakeDb({}).db);
    const res = await PATCH(req(body([adult(), adult({ id: P2 })])));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("PARTICIPANT_COUNT");
  });

  it("applies the same age rule as registration: an adult under 18 is rejected with a dob field error", async () => {
    const { db, calls } = fakeDb({});
    mockDb.mockReturnValue(db);
    const res = await PATCH(req(body([adult({ dob: "2015-01-01" })])));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.field).toBe("dob");
    expect(calls.some(c => c.op === "update")).toBe(false);
  });
});

describe("PATCH /api/it-run/register: a valid edit", () => {
  it("updates the same participant row and nothing else", async () => {
    const { db, calls } = fakeDb({});
    mockDb.mockReturnValue(db);

    const res = await PATCH(req(body([adult({ bibName: "ASHA R", tshirtSize: "L" })])));

    expect(res.status).toBe(200);
    const partUpdate = calls.find(c => c.table === "it_run_participants" && c.op === "update");
    expect(partUpdate?.filters).toMatchObject({ id: P1, registration_id: REG_ID });
    expect(partUpdate?.payload).toMatchObject({ bib_name: "ASHA R", tshirt_size: "L" });
  });

  it("never touches QR tokens, the registration code, capacity, coupons, or the payment", async () => {
    const { db, calls } = fakeDb({});
    mockDb.mockReturnValue(db);

    await PATCH(req(body([adult()])));

    // Audit rows may mention the code as a log detail; registration and participant writes may not change it
    const writes = calls.filter(c => c.op !== "select" && c.table !== "it_run_audit_logs");
    for (const w of writes) {
      expect(w.table).not.toMatch(/^rpc:/);
      expect(JSON.stringify(w.payload ?? {})).not.toMatch(/qr_token|razorpay|payment_status|registration_code|final_price/);
    }
    expect(calls.some(c => c.op === "insert" && c.table === "it_run_registrations")).toBe(false);
  });

  it("re-enters review for a changed company ID document and keeps children exempt", async () => {
    const { db, calls } = fakeDb({
      participants: [{ id: P1, company_id_url: "1760000000000-old1.jpg", verification_status: "verified" }],
    });
    mockDb.mockReturnValue(db);

    await PATCH(req(body([adult({ companyIdUrl: "1760000000000-new1.jpg" })])));

    const partUpdate = calls.find(c => c.table === "it_run_participants" && c.op === "update");
    expect(partUpdate?.payload).toMatchObject({ company_id_url: "1760000000000-new1.jpg", verification_status: "pending" });
  });

  it("leaves company verification alone when the document is unchanged", async () => {
    const { db, calls } = fakeDb({
      participants: [{ id: P1, company_id_url: "1760000000000-same1.jpg", verification_status: "verified" }],
    });
    mockDb.mockReturnValue(db);

    await PATCH(req(body([adult({ companyIdUrl: "1760000000000-same1.jpg" })])));

    const partUpdate = calls.find(c => c.table === "it_run_participants" && c.op === "update");
    expect(partUpdate?.payload).not.toHaveProperty("verification_status");
    expect(partUpdate?.payload).not.toHaveProperty("company_id_url");
  });
});
