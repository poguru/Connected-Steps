/**
 * A runner whose category was cancelled after a rejected ID must not be given a BIB, a T-shirt or a staff
 * entitlement. Each route refuses before it writes anything.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({
  requireRole: jest.fn(() => ({ email: "admin@example.com", role: "event_admin" })),
  getClientIp: () => "127.0.0.1",
}));
jest.mock("@/lib/staff-auth", () => ({
  requireStaffRole: jest.fn(() => ({ staffId: "staff-1", eventId: "ev-1", email: "staff@example.com", role: "bib_staff" })),
  requireStaffPermission: jest.fn(() => true),
  getClientIp: () => "127.0.0.1",
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { POST as bibCollect } from "@/app/api/it-run/admin/bib-collect/route";
import { POST as tshirtIssue } from "@/app/api/it-run/admin/tshirt-issue/route";
import { POST as entitlementIssue } from "@/app/api/it-run/staff/entitlements/issue/route";

const mockDb = getSupabaseServer as jest.Mock;

/** Fake database: one participant row, every write recorded. */
function fakeDb(participant: any) {
  const writes: Array<{ table: string; payload: any }> = [];
  const resultFor = (table: string) => {
    if (table === "it_run_events") return { id: "ev-1" };
    if (table === "it_run_participants") return participant;
    return null;
  };
  return {
    writes,
    from(table: string) {
      const b: any = {};
      for (const m of ["select", "eq", "is", "in", "order", "returns", "range"]) b[m] = () => b;
      b.single = () => Promise.resolve({ data: resultFor(table), error: null });
      b.maybeSingle = () => Promise.resolve({ data: resultFor(table), error: null });
      b.insert = (payload: any) => { writes.push({ table, payload }); return Promise.resolve({ data: null, error: null }); };
      b.update = (payload: any) => { writes.push({ table, payload }); return b; };
      b.then = (res: any, rej?: any) => Promise.resolve({ data: null, error: null }).then(res, rej);
      return b;
    },
  };
}

function participant(cancelled: boolean) {
  return {
    id: "p-1", first_name: "Asha", last_name: "Rao", bib_number: "5D001A", tshirt_size: "M",
    event_id: "ev-1", registration_id: "reg-1",
    cancelled_at: cancelled ? "2026-12-01T00:00:00Z" : null,
    it_run_registrations: { id: "reg-1", registration_code: "ITR-AAA", payment_status: "paid", registration_status: "active" },
  };
}

const json = (body: unknown) => new NextRequest("http://t/x", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("cancelled runners are refused", () => {
  it("the admin BIB collection refuses and records nothing", async () => {
    const db = fakeDb(participant(true));
    mockDb.mockReturnValue(db);
    const res = await bibCollect(json({ participantId: "p-1" }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("RUNNER_CANCELLED");
    expect(db.writes.filter(w => w.table === "it_run_bib_collections")).toEqual([]);
  });

  it("the T-shirt issue refuses and records nothing", async () => {
    const db = fakeDb(participant(true));
    mockDb.mockReturnValue(db);
    const res = await tshirtIssue(json({ participantId: "p-1" }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("RUNNER_CANCELLED");
    expect(db.writes.filter(w => w.table === "it_run_tshirt_issuances")).toEqual([]);
  });

  it("the staff entitlement issue refuses and records nothing", async () => {
    const db = fakeDb(participant(true));
    mockDb.mockReturnValue(db);
    const res = await entitlementIssue(json({ participantId: "p-1", entitlementType: "BIB" }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("RUNNER_CANCELLED");
    expect(db.writes.filter(w => w.table.startsWith("it_run_event_entitlements"))).toEqual([]);
  });

  it("a runner who was not cancelled still gets a BIB collection (control)", async () => {
    const db = fakeDb(participant(false));
    mockDb.mockReturnValue(db);
    const res = await bibCollect(json({ participantId: "p-1" }));
    expect(res.status).toBe(200);
    expect(db.writes.some(w => w.table === "it_run_bib_collections")).toBe(true);
  });
});
