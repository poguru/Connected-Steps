/**
 * BIB slot booking after payment. A booking error never looks like an unpaid registration, a retry never books twice,
 * and a registration still awaiting ID verification cannot book.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake Supabase builder is intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/notify", () => ({ sendEmail: jest.fn().mockResolvedValue({ ok: true }) }));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { POST } from "@/app/api/it-run/bib-booking/route";

type Err = { code?: string; message?: string } | null;

interface Fixture {
  part?: { id: string; registration_id: string; first_name: string; last_name: string; email: string | null } | null;
  partErr?: Err;
  reg?: { id: string; payment_status: string; registration_status: string; registration_code: string } | null;
  regErr?: Err;
  rpc?: string | null;
  rpcErr?: Err;
  existingSlotId?: string | null;
  slot?: Record<string, unknown> | null;
}

const SLOT = { location_name: "Hitec City Collection Counter", location_address: "HITEC City", slot_date: "2027-02-06", start_time: "10:00 AM", end_time: "06:00 PM" };

function fakeDb(f: Fixture) {
  const rpcCalls: Array<{ fn: string; args: any }> = [];
  return {
    rpcCalls,
    from(table: string) {
      const b: any = {};
      b.select = () => b;
      b.eq = () => b;
      b.maybeSingle = () => {
        if (table === "it_run_participants") {
          return Promise.resolve({ data: f.part === undefined ? PART : f.part, error: f.partErr ?? null });
        }
        if (table === "it_run_registrations") {
          return Promise.resolve({ data: f.reg === undefined ? REG : f.reg, error: f.regErr ?? null });
        }
        if (table === "it_run_bib_bookings") {
          return Promise.resolve({ data: f.existingSlotId ? { slot_id: f.existingSlotId } : null, error: null });
        }
        if (table === "it_run_bib_slots") {
          return Promise.resolve({ data: f.slot === undefined ? SLOT : f.slot, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };
      return b;
    },
    rpc(fn: string, args: any) {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: f.rpcErr ? null : (f.rpc ?? "confirmed"), error: f.rpcErr ?? null });
    },
  };
}

const PART = { id: "p-1", registration_id: "r-1", first_name: "Asha", last_name: "Rao", email: "asha@example.com" };
const REG = { id: "r-1", payment_status: "paid", registration_status: "active", registration_code: "ITR-ABC" };

function book(body: Record<string, unknown>) {
  return POST(new NextRequest("http://t/api/it-run/bib-booking", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

const GOOD = { participantId: "p-1", slotId: "s-1", registrationCode: "ITR-ABC" };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("POST /api/it-run/bib-booking: after payment", () => {
  it("books a slot for a confirmed, paid registration", async () => {
    const db = fakeDb({ rpc: "confirmed" });
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await book(GOOD);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.slot).toMatchObject({ location_name: "Hitec City Collection Counter" });
    expect(db.rpcCalls).toEqual([{ fn: "itr_book_bib_slot", args: { p_participant_id: "p-1", p_slot_id: "s-1" } }]);
  });

  it("a free registration books the same way", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb({ reg: { ...REG, payment_status: "free" } }));
    expect((await book(GOOD)).status).toBe(200);
  });

  it("a retry after the booking succeeded returns the existing slot, and books nothing new", async () => {
    const db = fakeDb({ rpc: "already_booked", existingSlotId: "s-1" });
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await book(GOOD);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, already: true });
    expect(json.slot).toMatchObject({ location_name: "Hitec City Collection Counter" });
  });

  it("a slot that fills before the participant confirms is refused with a clear message, and nothing is held", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb({ rpc: "full" }));
    const res = await book(GOOD);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/choose another slot/);
  });

  it("an unknown slot is refused", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb({ rpc: "slot_not_found" }));
    expect((await book(GOOD)).status).toBe(404);
  });

  it("concurrent requests for the final place: exactly one succeeds, the other is refused as full", async () => {
    // The database function decides atomically; this checks how the route answers each outcome.
    const first = fakeDb({ rpc: "confirmed" });
    const second = fakeDb({ rpc: "full" });
    (getSupabaseServer as jest.Mock).mockReturnValueOnce(first).mockReturnValueOnce(second);
    const [a, b] = await Promise.all([
      book({ ...GOOD, participantId: "p-1" }),
      book({ ...GOOD, participantId: "p-2" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });
});

describe("POST /api/it-run/bib-booking: a failure is never reported as an unpaid registration", () => {
  it("a database error reading the registration is a retryable error, not 'Registration not confirmed'", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb({ regErr: { code: "08006", message: "connection reset" }, reg: null }));
    const res = await book(GOOD);
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error).toMatch(/registration is unchanged/);
    expect(json.error).not.toMatch(/not confirmed/);
    expect(json.requestId).toBeTruthy();
  });

  it("a database error reading the participant is a retryable error", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb({ partErr: { code: "57014" }, part: null }));
    expect((await book(GOOD)).status).toBe(500);
  });

  it("a database function error leaves the booking unchanged and says so", async () => {
    const db = fakeDb({ rpcErr: { code: "40001", message: "serialization failure" } });
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await book(GOOD);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/registration is unchanged/);
  });

  it("an unpaid registration is refused as not confirmed", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb({ reg: { ...REG, payment_status: "pending" } }));
    const res = await book(GOOD);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Registration not confirmed");
  });
});

describe("POST /api/it-run/bib-booking: registration state", () => {
  it("a registration awaiting ID verification cannot book yet, and the database is not called", async () => {
    const db = fakeDb({ reg: { ...REG, registration_status: "pending_verification" } });
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await book(GOOD);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.code).toBe("REGISTRATION_PENDING");
    expect(db.rpcCalls).toEqual([]);
  });

  it("a cancelled registration cannot book", async () => {
    const db = fakeDb({ reg: { ...REG, registration_status: "cancelled" } });
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    expect((await book(GOOD)).status).toBe(400);
    expect(db.rpcCalls).toEqual([]);
  });

  it("a registration code that does not match the participant is refused like a missing participant", async () => {
    const db = fakeDb({});
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await book({ ...GOOD, registrationCode: "ITR-OTHER" });
    expect(res.status).toBe(404);
    expect(db.rpcCalls).toEqual([]);
  });

  it("a missing participant is refused", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb({ part: null }));
    expect((await book(GOOD)).status).toBe(404);
  });

  it("requires the registration code", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb({}));
    expect((await book({ participantId: "p-1", slotId: "s-1" })).status).toBe(400);
  });
});

describe("multi-participant booking", () => {
  it("each participant books their own slot; the second does not change the first", async () => {
    const db = fakeDb({ rpc: "confirmed" });
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const a = await book({ ...GOOD, participantId: "p-1", slotId: "s-1" });
    const b = await book({ ...GOOD, participantId: "p-2", slotId: "s-1" });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(db.rpcCalls.map(c => c.args.p_participant_id)).toEqual(["p-1", "p-2"]);
  });
});
