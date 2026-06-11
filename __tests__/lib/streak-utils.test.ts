import {
  calcDateGapStreak,
  calcMissToleranceStreak,
  calcHardBreakStreak,
  SESSION_GAP_DAYS,
} from "@/lib/streak-utils";

function days(n: number): number { return n * 24 * 60 * 60 * 1000; }

function dateAt(daysAgo: number): Date {
  return new Date(Date.now() - days(daysAgo));
}

// ── calcDateGapStreak ─────────────────────────────────────────────────────────

describe("calcDateGapStreak", () => {
  test("empty array returns 0", () => {
    expect(calcDateGapStreak([])).toBe(0);
  });

  test("single date returns 1", () => {
    expect(calcDateGapStreak([dateAt(0)])).toBe(1);
  });

  test("consecutive sessions all within gap count fully", () => {
    // 0, 7, 14 days ago — each gap is 7 days ≤ 14
    const dates = [dateAt(0), dateAt(7), dateAt(14)];
    expect(calcDateGapStreak(dates)).toBe(3);
  });

  test("gap exactly at limit (14 days) is included", () => {
    const dates = [dateAt(0), dateAt(SESSION_GAP_DAYS)];
    expect(calcDateGapStreak(dates)).toBe(2);
  });

  test("gap one day over limit breaks streak", () => {
    const dates = [dateAt(0), dateAt(SESSION_GAP_DAYS + 1)];
    expect(calcDateGapStreak(dates)).toBe(1);
  });

  test("gap in the middle stops counting after break", () => {
    // 0, 7, 25 days ago — gap between 7 and 25 is 18 days > 14
    const dates = [dateAt(0), dateAt(7), dateAt(25), dateAt(30)];
    expect(calcDateGapStreak(dates)).toBe(2);
  });

  test("custom maxGapDays is respected", () => {
    const dates = [dateAt(0), dateAt(3)];
    expect(calcDateGapStreak(dates, 2)).toBe(1); // gap 3 > max 2
    expect(calcDateGapStreak(dates, 4)).toBe(2); // gap 3 ≤ max 4
  });

  test("SESSION_GAP_DAYS constant is 14", () => {
    expect(SESSION_GAP_DAYS).toBe(14);
  });
});

// ── calcMissToleranceStreak ───────────────────────────────────────────────────

describe("calcMissToleranceStreak", () => {
  test("empty array returns 0", () => {
    expect(calcMissToleranceStreak([])).toBe(0);
  });

  test("all attended returns full count", () => {
    const sessions = [
      { attended: true, date: "2026-06-10" },
      { attended: true, date: "2026-06-03" },
      { attended: true, date: "2026-05-27" },
    ];
    expect(calcMissToleranceStreak(sessions)).toBe(3);
  });

  test("single miss is tolerated — streak continues", () => {
    const sessions = [
      { attended: true,  date: "2026-06-10" },
      { attended: false, date: "2026-06-03" }, // 1 miss — tolerated
      { attended: true,  date: "2026-05-27" },
    ];
    expect(calcMissToleranceStreak(sessions)).toBe(2);
  });

  test("two consecutive misses end the streak", () => {
    const sessions = [
      { attended: true,  date: "2026-06-10" },
      { attended: false, date: "2026-06-03" },
      { attended: false, date: "2026-05-27" }, // 2nd consecutive miss — breaks
      { attended: true,  date: "2026-05-20" }, // not counted
    ];
    expect(calcMissToleranceStreak(sessions)).toBe(1);
  });

  test("leading misses at the front do not count against initial streak", () => {
    // Two misses at the front: streak should be 0 right away
    const sessions = [
      { attended: false, date: "2026-06-10" },
      { attended: false, date: "2026-06-03" },
      { attended: true,  date: "2026-05-27" },
    ];
    expect(calcMissToleranceStreak(sessions)).toBe(0);
  });

  test("sorts by date descending internally", () => {
    // Input in ascending order — must be re-sorted
    const sessions = [
      { attended: true, date: "2026-05-27" },
      { attended: true, date: "2026-06-03" },
      { attended: true, date: "2026-06-10" },
    ];
    expect(calcMissToleranceStreak(sessions)).toBe(3);
  });

  test("does not mutate the input array", () => {
    const sessions = [
      { attended: true, date: "2026-06-10" },
      { attended: true, date: "2026-06-03" },
    ];
    const copy = [...sessions];
    calcMissToleranceStreak(sessions);
    expect(sessions).toEqual(copy);
  });
});

// ── calcHardBreakStreak ───────────────────────────────────────────────────────

describe("calcHardBreakStreak", () => {
  test("empty array returns 0", () => {
    expect(calcHardBreakStreak([])).toBe(0);
  });

  test("all attended returns full count", () => {
    const sessions = [
      { attended: true },
      { attended: true },
      { attended: true },
    ];
    expect(calcHardBreakStreak(sessions)).toBe(3);
  });

  test("first false breaks immediately", () => {
    const sessions = [
      { attended: true  },
      { attended: false }, // break
      { attended: true  }, // not counted
    ];
    expect(calcHardBreakStreak(sessions)).toBe(1);
  });

  test("undefined attendance is skipped without breaking streak", () => {
    const sessions = [
      { attended: true      },
      { attended: undefined }, // no record — skip, does not increment
      { attended: true      },
      { attended: false     }, // break
      { attended: true      }, // not counted
    ];
    // Only 2 true values appear before the false — expect 2
    expect(calcHardBreakStreak(sessions)).toBe(2);
  });

  test("null attendance is treated the same as undefined (skip)", () => {
    const sessions = [
      { attended: true },
      { attended: null }, // skip — does not increment
      { attended: true },
    ];
    // 2 true values, null skipped — expect 2
    expect(calcHardBreakStreak(sessions)).toBe(2);
  });

  test("all undefined returns 0 (no attended sessions)", () => {
    const sessions = [
      { attended: undefined },
      { attended: undefined },
    ];
    expect(calcHardBreakStreak(sessions)).toBe(0);
  });

  test("false at the start returns 0", () => {
    const sessions = [
      { attended: false },
      { attended: true  },
    ];
    expect(calcHardBreakStreak(sessions)).toBe(0);
  });
});
