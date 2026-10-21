/**
 * Registration monitoring: status from times, valid journey keys, counts, recording that never throws or blocks,
 * private tables, and an admin-only summary.
 */

import fs from "fs";
import path from "path";
import {
  journeyStatus, isValidJourneyKey, summarizeJourneys, recordJourneyEvent,
  ABANDON_AFTER_MINUTES, ACTIVE_WINDOW_MINUTES,
} from "@/lib/it-run-monitoring";

jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: jest.fn(() => { throw new Error("database unavailable"); }),
}));

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
const NOW = Date.parse("2026-10-21T10:00:00Z");
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe("journey status", () => {
  it("is active with recent activity", () => {
    expect(journeyStatus({ completedAt: null, lastActivityAt: minsAgo(1) }, NOW)).toBe("active");
    expect(journeyStatus({ completedAt: null, lastActivityAt: minsAgo(ACTIVE_WINDOW_MINUTES) }, NOW)).toBe("active");
  });

  it("is abandoned after the abandon window with no completion", () => {
    expect(journeyStatus({ completedAt: null, lastActivityAt: minsAgo(ABANDON_AFTER_MINUTES + 1) }, NOW)).toBe("abandoned");
  });

  it("is completed whenever completion is recorded, however old", () => {
    expect(journeyStatus({ completedAt: minsAgo(1000), lastActivityAt: minsAgo(1000) }, NOW)).toBe("completed");
  });

  it("the gap between active and abandoned is not counted as active", () => {
    expect(journeyStatus({ completedAt: null, lastActivityAt: minsAgo(ACTIVE_WINDOW_MINUTES + 2) }, NOW)).toBe("abandoned");
  });
});

describe("journey keys", () => {
  it("accepts a random browser key", () => {
    expect(isValidJourneyKey("aB3_-xY9kLmN0pQrStUv")).toBe(true);
  });

  it("refuses short, long, or unsafe keys", () => {
    expect(isValidJourneyKey("short")).toBe(false);
    expect(isValidJourneyKey("x".repeat(65))).toBe(false);
    expect(isValidJourneyKey("person@example.com/12345")).toBe(false);
    expect(isValidJourneyKey(undefined)).toBe(false);
  });
});

describe("the summary counts", () => {
  it("counts each status and the conversion, and groups by stage", () => {
    const summary = summarizeJourneys([
      { completedAt: minsAgo(60), lastActivityAt: minsAgo(60), currentStage: "confirmed" },
      { completedAt: null, lastActivityAt: minsAgo(1), currentStage: "otp_requested" },
      { completedAt: null, lastActivityAt: minsAgo(120), currentStage: "details_submitted" },
      { completedAt: null, lastActivityAt: minsAgo(2), currentStage: "otp_requested" },
    ], NOW);
    expect(summary.total).toBe(4);
    expect(summary.completed).toBe(1);
    expect(summary.active).toBe(2);
    expect(summary.abandoned).toBe(1);
    expect(summary.conversionPercent).toBe(25);
    expect(summary.byStage).toEqual({ confirmed: 1, otp_requested: 2, details_submitted: 1 });
  });

  it("reports no conversion when there are no journeys", () => {
    expect(summarizeJourneys([], NOW).conversionPercent).toBeNull();
  });
});

describe("recording never blocks registration", () => {
  it("returns false and does not throw when storage is down", async () => {
    await expect(recordJourneyEvent({
      journeyKey: "aB3_-xY9kLmN0pQrStUv", eventId: null, eventType: "stage_reached", stage: "landing",
    })).resolves.toBe(false);
  });

  it("drops an invalid key without touching storage", async () => {
    await expect(recordJourneyEvent({
      journeyKey: "bad key!", eventId: null, eventType: "stage_reached",
    })).resolves.toBe(false);
  });
});

describe("the tables and the summary are private", () => {
  it("the migration turns row-level security on for both tables and defines no browser policy", () => {
    const sql = read("supabase/migrations/20261023000010_registration_monitoring.sql");
    expect(sql).toMatch(/ALTER TABLE public\.registration_journeys ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.registration_journey_events ENABLE ROW LEVEL SECURITY/);
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });

  it("the summary route requires an event admin session", () => {
    const route = read("app/api/it-run/admin/monitoring/route.ts");
    expect(route).toMatch(/requireRole\(req, \["event_admin"\]\)/);
    expect(route).toMatch(/status: 401/);
  });
});
