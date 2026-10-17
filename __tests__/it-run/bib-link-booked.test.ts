/**
 * The BIB collection link: a runner who already holds a confirmed slot keeps it. A different slot is refused with the
 * confirmed one, the same slot again is a safe success, and the page offers no way to change a confirmed slot.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake database is intentionally loosely typed */

import fs from "fs";
import path from "path";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
  checkAndRecordEndpointLimit: jest.fn().mockResolvedValue({ limited: false, retryAfter: 0 }),
  getClientIp: jest.fn(() => "203.0.113.9"),
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { POST } from "@/app/api/events/it-run-sprint-2/bib-collection/[token]/route";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
const mockDb = getSupabaseServer as jest.Mock;

const TOKEN = "a".repeat(48);
const PART = "p1";
const SLOT_A = "11111111-1111-1111-1111-111111111111";
const SLOT_B = "22222222-2222-2222-2222-222222222222";

function slotRow(id: string) {
  return { id, location_name: id === SLOT_A ? "Gate A" : "Gate B", location_address: null, slot_date: "2027-02-06", start_time: "09:00", end_time: "11:00" };
}

function fakeDb(opts: { rpc: string; held?: string | null }) {
  const rpcs: any[] = [];
  const tables: Record<string, any> = {
    it_run_registrations: { id: "r1", payment_status: "paid", registration_status: "active", registration_code: "ITRUN2-AAAA", lead_email: "a@x", participant_count: 1, it_run_categories: null, it_run_events: null },
    it_run_participants: { id: PART, first_name: "Asha", last_name: "Rao", email: null },
    it_run_bib_bookings: opts.held ? { slot_id: opts.held } : null,
  };
  return {
    rpcs,
    from(table: string) {
      const b: any = {};
      for (const m of ["select", "eq", "is"]) b[m] = () => b;
      b.maybeSingle = () => {
        if (table === "it_run_bib_slots") return Promise.resolve({ data: slotRow(opts.held ?? SLOT_A), error: null });
        return Promise.resolve({ data: tables[table] ?? null, error: null });
      };
      b.single = () => Promise.resolve({ data: slotRow(SLOT_A), error: null });
      return b;
    },
    rpc(name: string, args: any) {
      rpcs.push({ name, args });
      return Promise.resolve({ data: opts.rpc, error: null });
    },
  };
}

function req(slotId: string) {
  return new NextRequest(`http://t/api/events/it-run-sprint-2/bib-collection/${TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantId: PART, slotId }),
  });
}

const params = { params: Promise.resolve({ token: TOKEN }) };

describe("the link keeps a confirmed slot", () => {
  it("a different slot after a confirmed booking is refused with the confirmed slot", async () => {
    mockDb.mockReturnValue(fakeDb({ rpc: "already_booked", held: SLOT_A }));
    const res = await POST(req(SLOT_B), params);
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe("SLOT_ALREADY_CONFIRMED");
    expect(body.slot).toMatchObject({ location_name: "Gate A" });
  });

  it("the same slot again is a safe success, with the slot the runner holds", async () => {
    mockDb.mockReturnValue(fakeDb({ rpc: "already_booked", held: SLOT_A }));
    const res = await POST(req(SLOT_A), params);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, already: true });
    expect(body.slot).toMatchObject({ location_name: "Gate A" });
  });

  it("a first booking goes through the function once", async () => {
    const db = fakeDb({ rpc: "confirmed" });
    mockDb.mockReturnValue(db);
    const res = await POST(req(SLOT_A), params);
    expect(res.status).toBe(200);
    expect(db.rpcs).toEqual([{ name: "itr_book_bib_slot", args: { p_participant_id: PART, p_slot_id: SLOT_A } }]);
  });

  it("an invalid token is still refused as an invalid link, not as booked", async () => {
    const db = {
      rpcs: [] as any[],
      from() {
        const b: any = {};
        for (const m of ["select", "eq", "is"]) b[m] = () => b;
        b.maybeSingle = () => Promise.resolve({ data: null, error: null });
        return b;
      },
      rpc() { return Promise.resolve({ data: null, error: null }); },
    };
    mockDb.mockReturnValue(db);
    const res = await POST(req(SLOT_A), params);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Invalid or expired link");
  });
});

describe("the link page offers no way to change a confirmed slot", () => {
  const page = read("app/events/it-run-sprint-2/bib-collection/[token]/page.tsx");

  it("has no Change Slot button", () => {
    expect(page).not.toMatch(/Change Slot/);
  });

  it("shows a confirmed slot as Slot Confirmed and cannot be changed", () => {
    expect(page).toMatch(/✓ Slot Confirmed/);
    expect(page).toMatch(/Your BIB collection slot is confirmed and cannot be changed\./);
  });

  it("the slot picker is shown only to a runner without a confirmed slot", () => {
    expect(page).toMatch(/\{participant\.current_booking \? \([\s\S]*?\) : \([\s\S]*?<SlotPicker/);
  });

  it("a refused change refreshes the page and says nothing was booked", () => {
    expect(page).toMatch(/json\.code === "SLOT_ALREADY_CONFIRMED"/);
    expect(page).toMatch(/void fetchData\(\);/);
  });

  it("the fully-booked message for one runner uses the agreed wording", () => {
    expect(page).toMatch(/You’ve Already Booked Your BIB Collection Slot!/);
    expect(page).toMatch(/You don’t need to book it again\./);
  });
});
