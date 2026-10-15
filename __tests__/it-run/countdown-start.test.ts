/**
 * The countdown's start moment: the configured flag-off time in India time.
 */
import { parseClockTime, eventStartDate } from "@/lib/it-run-countdown";

describe("parseClockTime", () => {
  it("reads 12-hour clock times", () => {
    expect(parseClockTime("6:00 AM")).toEqual({ hour: 6, minute: 0 });
    expect(parseClockTime("12:30 PM")).toEqual({ hour: 12, minute: 30 });
    expect(parseClockTime("12:05 AM")).toEqual({ hour: 0, minute: 5 });
    expect(parseClockTime("7:45pm")).toEqual({ hour: 19, minute: 45 });
  });

  it("returns null for anything that is not a clock time", () => {
    expect(parseClockTime("six")).toBeNull();
    expect(parseClockTime("13:00 PM")).toBeNull();
    expect(parseClockTime("6:61 AM")).toBeNull();
    expect(parseClockTime(null)).toBeNull();
  });
});

describe("eventStartDate", () => {
  it("uses the configured flag-off time in India time", () => {
    expect(eventStartDate("2027-02-07", "6:00 AM")?.toISOString()).toBe("2027-02-07T00:30:00.000Z");
    expect(eventStartDate("2027-02-07", "2:15 PM")?.toISOString()).toBe("2027-02-07T08:45:00.000Z");
  });

  it("falls back to 6:00 AM when the flag-off time is missing or unreadable", () => {
    expect(eventStartDate("2027-02-07", null)?.toISOString()).toBe("2027-02-07T00:30:00.000Z");
    expect(eventStartDate("2027-02-07", "soon")?.toISOString()).toBe("2027-02-07T00:30:00.000Z");
  });

  it("is null without a calendar date", () => {
    expect(eventStartDate(null, "6:00 AM")).toBeNull();
    expect(eventStartDate("07/02/2027", "6:00 AM")).toBeNull();
    expect(eventStartDate("2027-02-31", "6:00 AM")?.toISOString()).toBeUndefined();
  });
});
