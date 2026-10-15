/**
 * Each participant's category in the admin and participant views: their own category first, the registration's
 * category for rows that have none, and a failed lookup that never fails the list.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake database is intentionally loosely typed */

import {
  participantCategoryMap, categoryOfParticipant, type ParticipantCategory,
} from "@/lib/it-run-participant-category";
import { buildMyRegistrations, type MyRegistrationRow, type MyRegParticipantRow } from "@/lib/it-run-my-registrations";

const SOLO: ParticipantCategory = { name: "10K Timed Run", color: "#e8620a" };
const DUO: ParticipantCategory = { name: "5K Duo Challenge", color: "#6366f1" };
const CATS = new Map([["cat-solo", SOLO], ["cat-duo", DUO]]);

describe("categoryOfParticipant", () => {
  it("uses the participant's own category, even when the registration has another", () => {
    expect(categoryOfParticipant("cat-duo", CATS, SOLO)).toEqual(DUO);
  });

  it("falls back to the registration's category for a row with no category of its own", () => {
    expect(categoryOfParticipant(null, CATS, SOLO)).toEqual(SOLO);
  });

  it("falls back to the registration's category when the participant's category is unknown", () => {
    expect(categoryOfParticipant("cat-gone", CATS, DUO)).toEqual(DUO);
  });

  it("is null when neither is known", () => {
    expect(categoryOfParticipant(null, new Map(), null)).toBeNull();
  });
});

describe("participantCategoryMap", () => {
  function db(result: { data: unknown; error: unknown }) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const b: any = {};
    b.select = (...args: unknown[]) => { calls.push({ method: "select", args }); return b; };
    b.in = (...args: unknown[]) => { calls.push({ method: "in", args }); return b; };
    b.returns = () => Promise.resolve(result);
    return { calls, from: () => b } as any;
  }

  it("looks up each category once, by id", async () => {
    const fake = db({ data: [{ id: "cat-solo", name: "10K Timed Run", color: "#e8620a" }], error: null });
    const map = await participantCategoryMap(fake, ["cat-solo", "cat-solo", ""]);
    expect(map.get("cat-solo")).toEqual(SOLO);
    expect(fake.calls.find((c: any) => c.method === "in")!.args).toEqual(["id", ["cat-solo"]]);
  });

  it("makes no query when there are no ids", async () => {
    const fake = db({ data: [], error: null });
    expect((await participantCategoryMap(fake, [])).size).toBe(0);
    expect(fake.calls).toEqual([]);
  });

  it("returns an empty map when the lookup fails, rather than failing the list", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const map = await participantCategoryMap(db({ data: null, error: { code: "XX" } }), ["cat-solo"]);
    expect(map.size).toBe(0);
    (console.error as jest.Mock).mockRestore();
  });
});

describe("My Registrations shows each participant's category", () => {
  const reg = {
    id: "reg-1", registration_code: "ITR-1", payment_status: "paid", registration_status: "active",
    final_price: 2398, base_price: 2398, discount_amount: 0, early_bird_offer_id: null, participant_count: 3,
    created_at: "2026-10-15T00:00:00Z", category: { name: "10K Timed Run", distance_km: 10, color: "#e8620a", category_type: "solo" },
    event: { title: "The IT Run Sprint-2", event_date: "2027-02-07" },
  } as unknown as MyRegistrationRow;

  const part = (id: string, categoryId: string | null): MyRegParticipantRow => ({
    id, registration_id: "reg-1", first_name: id, last_name: "R", participant_type: "solo",
    bib_number: null, qr_token: null, verification_status: "not_required", category_id: categoryId,
  });

  it("gives each runner the category they are in, not the registration's", () => {
    const [built] = buildMyRegistrations(
      [reg],
      [part("a", "cat-solo"), part("b", "cat-duo"), part("c", "cat-duo")],
      [],
      new Map(),
      true,
      CATS,
    );
    expect(built.participants.map(p => p.category?.name)).toEqual(["10K Timed Run", "5K Duo Challenge", "5K Duo Challenge"]);
  });

  it("shows the registration's category for a runner with no category of their own", () => {
    const [built] = buildMyRegistrations([reg], [part("a", null)], [], new Map(), true, CATS);
    expect(built.participants[0].category).toEqual({ name: "10K Timed Run", color: "#e8620a" });
  });
});
