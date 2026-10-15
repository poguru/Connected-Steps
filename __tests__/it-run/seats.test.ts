/**
 * Seats per category for a booking: merging, participant-based counts, and the reserve/release calls sent to the
 * database. The database itself is not run here; its functions are checked by reading the migration.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake database is intentionally loosely typed */

import {
  mergeSeatLines,
  seatLinesFromParticipants,
  totalSeats,
  reserveSeats,
  releaseSeats,
  seatLinesForRegistration,
} from "@/lib/it-run-seats";

describe("mergeSeatLines", () => {
  it("adds up repeated categories and keeps the first-seen order", () => {
    expect(mergeSeatLines([
      { categoryId: "b", count: 1 },
      { categoryId: "a", count: 2 },
      { categoryId: "b", count: 3 },
    ])).toEqual([
      { categoryId: "b", count: 4 },
      { categoryId: "a", count: 2 },
    ]);
  });

  it("drops empty and invalid lines", () => {
    expect(mergeSeatLines([
      { categoryId: "a", count: 0 },
      { categoryId: "", count: 2 },
      { categoryId: "b", count: -1 },
      { categoryId: "c", count: 1 },
    ])).toEqual([{ categoryId: "c", count: 1 }]);
  });
});

describe("seatLinesFromParticipants", () => {
  it("counts each participant in their own category", () => {
    const lines = seatLinesFromParticipants([
      { category_id: "solo" },
      { category_id: "solo" },
      { category_id: "duo" },
      { category_id: "duo" },
    ], "solo");
    expect(lines).toEqual([
      { categoryId: "solo", count: 2 },
      { categoryId: "duo", count: 2 },
    ]);
    expect(totalSeats(lines)).toBe(4);
  });

  it("counts a participant with no category toward the registration's category", () => {
    expect(seatLinesFromParticipants([{ category_id: null }, { category_id: "duo" }], "solo")).toEqual([
      { categoryId: "solo", count: 1 },
      { categoryId: "duo", count: 1 },
    ]);
  });
});

describe("database calls", () => {
  function fakeDb(rpcResult: unknown = "confirmed", rpcError: unknown = null) {
    const calls: Array<{ name: string; args: any }> = [];
    const participants: Array<{ category_id: string | null }> = [];
    return {
      calls,
      participants,
      rpc: jest.fn(async (name: string, args: any) => {
        calls.push({ name, args });
        return name === "itr_reserve_capacity_multi"
          ? { data: rpcResult, error: rpcError }
          : { data: null, error: null };
      }),
      from: () => {
        const b: any = {};
        b.select = () => b;
        b.eq = () => b;
        b.is = () => b;
        b.returns = () => Promise.resolve({ data: participants, error: null });
        return b;
      },
    } as any;
  }

  it("reserves all lines in one call, with each line's category and count", async () => {
    const db = fakeDb("confirmed");
    const result = await reserveSeats(db, [
      { categoryId: "solo", count: 2 },
      { categoryId: "duo", count: 2 },
    ], 15);
    expect(result).toBe("confirmed");
    expect(db.calls).toEqual([{
      name: "itr_reserve_capacity_multi",
      args: {
        p_lines: [
          { category_id: "solo", count: 2 },
          { category_id: "duo", count: 2 },
        ],
        p_payment_ttl_mins: 15,
      },
    }]);
  });

  it("passes through 'full' and 'unavailable' from the database", async () => {
    expect(await reserveSeats(fakeDb("full"), [{ categoryId: "a", count: 1 }])).toBe("full");
    expect(await reserveSeats(fakeDb("unavailable"), [{ categoryId: "a", count: 1 }])).toBe("unavailable");
  });

  it("reports an error when the call fails or returns something unexpected", async () => {
    expect(await reserveSeats(fakeDb("confirmed", { message: "boom" }), [{ categoryId: "a", count: 1 }])).toBe("error");
    expect(await reserveSeats(fakeDb("weird"), [{ categoryId: "a", count: 1 }])).toBe("error");
  });

  it("does not call the database when there is nothing to reserve", async () => {
    const db = fakeDb();
    expect(await reserveSeats(db, [])).toBe("confirmed");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("releases each category separately, with that category's count", async () => {
    const db = fakeDb();
    await releaseSeats(db, [
      { categoryId: "solo", count: 2 },
      { categoryId: "duo", count: 2 },
    ]);
    expect(db.calls).toEqual([
      { name: "itr_release_capacity", args: { p_category_id: "solo", p_count: 2 } },
      { name: "itr_release_capacity", args: { p_category_id: "duo", p_count: 2 } },
    ]);
  });

  it("reads a stored booking's seats from its participants, and falls back to the registration", async () => {
    const db = fakeDb();
    db.participants.push({ category_id: "solo" }, { category_id: "duo" }, { category_id: "duo" });
    expect(await seatLinesForRegistration(db, "reg-1", { categoryId: "solo", participantCount: 3 })).toEqual([
      { categoryId: "solo", count: 1 },
      { categoryId: "duo", count: 2 },
    ]);

    const empty = fakeDb();
    // No active runner (every runner cancelled): nothing is held
    expect(await seatLinesForRegistration(empty, "reg-2", { categoryId: "solo", participantCount: 2 })).toEqual([]);
  });
});
