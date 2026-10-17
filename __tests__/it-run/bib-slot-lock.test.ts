/**
 * A confirmed BIB collection slot is locked: the booking function never replaces it, the API refuses a different slot
 * with the confirmed one, the same slot again is a safe success, and the dashboard never says a refused change worked.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake database is intentionally loosely typed */

import fs from "fs";
import path from "path";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("crypto", () => ({ randomUUID: () => "req-1" }));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { POST } from "@/app/api/it-run/bib-booking/route";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
const mockDb = getSupabaseServer as jest.Mock;

const REG_CODE = "ITRUN2-AAAA";
const SLOT_A = "11111111-1111-1111-1111-111111111111";
const SLOT_B = "22222222-2222-2222-2222-222222222222";

const SLOT_ROW = (id: string) => ({
  location_name: id === SLOT_A ? "Gate A" : "Gate B", location_address: null,
  slot_date: "2027-02-06", start_time: "09:00", end_time: "11:00",
});

function fakeDb(opts: { rpc: string; heldSlotId?: string | null }) {
  const rpcs: any[] = [];
  const tables: Record<string, any> = {
    it_run_participants: { id: "p1", registration_id: "r1", first_name: "Asha", last_name: "Rao", email: null, cancelled_at: null },
    it_run_registrations: { id: "r1", payment_status: "paid", registration_status: "active", registration_code: REG_CODE },
    it_run_bib_bookings: opts.heldSlotId ? { slot_id: opts.heldSlotId } : null,
    it_run_bib_slots: null,
  };
  return {
    rpcs,
    from(table: string) {
      const b: any = {};
      for (const m of ["select", "eq", "is"]) b[m] = () => b;
      b.maybeSingle = () => {
        if (table === "it_run_bib_slots") return Promise.resolve({ data: SLOT_ROW(opts.heldSlotId ?? SLOT_A), error: null });
        return Promise.resolve({ data: tables[table], error: null });
      };
      return b;
    },
    rpc(name: string, args: any) {
      rpcs.push({ name, args });
      return Promise.resolve({ data: opts.rpc, error: null });
    },
  };
}

function req(slotId: string, code = REG_CODE) {
  return new NextRequest("http://t/api/it-run/bib-booking", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantId: "p1", slotId, registrationCode: code }),
  });
}

describe("the database function never moves a confirmed booking", () => {
  const sql = read("supabase/migrations/20261018000001_bib_slot_lock.sql");

  it("locks the runner's row before deciding, so concurrent requests run one after the other", () => {
    expect(sql).toMatch(/FROM it_run_participants WHERE id = p_participant_id FOR UPDATE/);
  });

  it("re-confirms only a cancelled booking, never a confirmed one", () => {
    expect(sql).toMatch(/ON CONFLICT \(participant_id\) DO UPDATE[\s\S]*WHERE it_run_bib_bookings\.status <> 'confirmed'/);
  });

  it("counts capacity only after a booking row was really written", () => {
    const returningAt = sql.indexOf("RETURNING id INTO v_booking");
    const nullCheckAt = sql.indexOf("IF v_booking IS NULL THEN");
    const countAt = sql.indexOf("booked_count = booked_count + 1");
    expect(returningAt).toBeGreaterThan(0);
    expect(nullCheckAt).toBeGreaterThan(returningAt);
    expect(countAt).toBeGreaterThan(nullCheckAt);
  });

  it("the old unconditional overwrite is gone", () => {
    expect(sql).not.toMatch(/DO UPDATE SET slot_id = p_slot_id/);
  });
});

describe("the booking API keeps a confirmed slot", () => {
  it("refuses a different slot and returns the confirmed one", async () => {
    mockDb.mockReturnValue(fakeDb({ rpc: "already_booked", heldSlotId: SLOT_A }));
    const res = await POST(req(SLOT_B));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe("SLOT_ALREADY_CONFIRMED");
    expect(body.slot).toMatchObject({ location_name: "Gate A" });
  });

  it("the same slot again is a safe success, with the existing slot", async () => {
    mockDb.mockReturnValue(fakeDb({ rpc: "already_booked", heldSlotId: SLOT_A }));
    const res = await POST(req(SLOT_A));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, already: true });
    expect(body.slot).toMatchObject({ location_name: "Gate A" });
  });

  it("a new booking goes through the function once and is confirmed", async () => {
    const db = fakeDb({ rpc: "confirmed" });
    mockDb.mockReturnValue(db);
    const res = await POST(req(SLOT_A));
    expect(res.status).toBe(200);
    expect(db.rpcs).toEqual([{ name: "itr_book_bib_slot", args: { p_participant_id: "p1", p_slot_id: SLOT_A } }]);
  });

  it("a request with another registration's code is refused and nothing is booked", async () => {
    const db = fakeDb({ rpc: "confirmed" });
    mockDb.mockReturnValue(db);
    const res = await POST(req(SLOT_A, "ITRUN2-ZZZZ"));
    expect(res.status).toBe(404);
    expect(db.rpcs).toEqual([]);
  });

  it("a participant the database does not know is refused without a booking", async () => {
    mockDb.mockReturnValue(fakeDb({ rpc: "participant_not_found" }));
    const res = await POST(req(SLOT_A));
    expect(res.status).toBe(404);
  });
});

describe("the dashboard booker never claims a refused change worked", () => {
  const page = read("app/it-run/dashboard/[code]/page.tsx");

  it("shows the confirmed slot as Slot Confirmed and says it cannot be changed", () => {
    expect(page).toMatch(/Slot Confirmed/);
    expect(page).toMatch(/Your BIB collection slot is confirmed and cannot be changed\./);
  });

  it("a refused change shows the error and refreshes, without the success message", () => {
    expect(page).toMatch(/res\.status === 409 && data\.code === "SLOT_ALREADY_CONFIRMED"/);
    expect(page).toMatch(/setError\(data\.error[\s\S]*?onBooked\(\);\s*return;/);
  });

  it("a retry of the same slot does not claim a new email was sent", () => {
    expect(page).toMatch(/data\.already \? "Your BIB collection slot is confirmed\." : "Slot booked successfully! Confirmation sent to your email\."/);
  });
});
