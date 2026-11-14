/**
 * Abandoned journeys are split by how far they got: a visitor who only opened the page is counted separately from one who
 * started the registration. The split uses only the stage reached, so no personal data is involved.
 */

import { summarizeJourneys } from "@/lib/it-run-monitoring";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const stale = new Date(NOW - 60 * 60_000).toISOString();
const fresh = new Date(NOW - 60_000).toISOString();

describe("abandoned journeys by how far they got", () => {
  it("counts a journey that only reached the first step separately", () => {
    const s = summarizeJourneys([
      { completedAt: null, lastActivityAt: stale, currentStage: "landing" },
      { completedAt: null, lastActivityAt: stale, currentStage: "landing" },
    ], NOW);
    expect(s.abandoned).toBe(2);
    expect(s.abandonedOnFirstStep).toBe(2);
    expect(s.abandonedAfterStarting).toBe(0);
  });

  it("counts a journey that entered details and stopped as after starting", () => {
    const s = summarizeJourneys([
      { completedAt: null, lastActivityAt: stale, currentStage: "details_submitted" },
      { completedAt: null, lastActivityAt: stale, currentStage: "landing" },
    ], NOW);
    expect(s.abandonedOnFirstStep).toBe(1);
    expect(s.abandonedAfterStarting).toBe(1);
  });

  it("active and completed journeys are not counted as abandoned", () => {
    const s = summarizeJourneys([
      { completedAt: null, lastActivityAt: fresh, currentStage: "details_submitted" },
      { completedAt: fresh, lastActivityAt: fresh, currentStage: "confirmed" },
    ], NOW);
    expect(s.abandoned).toBe(0);
    expect(s.abandonedOnFirstStep).toBe(0);
    expect(s.abandonedAfterStarting).toBe(0);
  });
});
