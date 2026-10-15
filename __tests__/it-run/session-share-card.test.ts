/**
 * The content of a session's share image: fallbacks, date and time formats, and the join link are never invented.
 */

import {
  buildCardModel, formatCardDate, formatCardTime, kickerFor, cardVenue, titleFontSize, SHARE_FORMAT_SIZE,
} from "@/lib/session-share-card";

describe("formatCardDate", () => {
  it("formats a real date with its weekday", () => {
    expect(formatCardDate("2026-10-16")).toBe("Friday, 16 October 2026");
  });

  it("refuses a date that does not exist, or is not YYYY-MM-DD", () => {
    expect(formatCardDate("2026-02-31")).toBeNull();
    expect(formatCardDate("16/10/2026")).toBeNull();
    expect(formatCardDate(null)).toBeNull();
  });
});

describe("formatCardTime", () => {
  it("writes 24-hour times in 12-hour form", () => {
    expect(formatCardTime("06:00")).toBe("6:00 AM");
    expect(formatCardTime("18:30")).toBe("6:30 PM");
    expect(formatCardTime("00:15")).toBe("12:15 AM");
  });

  it("keeps a 12-hour time as written, in capitals", () => {
    expect(formatCardTime("7:45 pm")).toBe("7:45 PM");
  });

  it("returns null for anything else rather than guessing", () => {
    expect(formatCardTime("soon")).toBeNull();
    expect(formatCardTime("25:00")).toBeNull();
    expect(formatCardTime("")).toBeNull();
    expect(formatCardTime(null)).toBeNull();
  });
});

describe("cardVenue", () => {
  it("uses the venue, then the location, and is null when neither is set", () => {
    expect(cardVenue({ venue: "Botanical Garden", location: "Hyderabad" })).toBe("Botanical Garden");
    expect(cardVenue({ venue: " ", location: "Hyderabad" })).toBe("Hyderabad");
    expect(cardVenue({ venue: null, location: null })).toBeNull();
  });
});

describe("buildCardModel", () => {
  const full = {
    title: "Strength & Conditioning", date: "2026-10-16", time: "06:00", venue: "Botanical Garden",
    location: "Hyderabad", photo_url: "https://cdn.example.com/p.jpg",
  };

  it("shows every detail the session has", () => {
    expect(buildCardModel(full)).toEqual({
      kicker: "Strength & Conditioning",
      title: "Strength & Conditioning",
      dateLabel: "Friday, 16 October 2026",
      timeLabel: "6:00 AM",
      venueLabel: "Botanical Garden",
      photoUrl: "https://cdn.example.com/p.jpg",
      ctaLabel: "Join this run",
    });
  });

  it("leaves out a missing date, time or venue instead of showing a placeholder", () => {
    const model = buildCardModel({ ...full, date: null, time: "not a time", venue: null, location: null });
    expect(model.dateLabel).toBeNull();
    expect(model.timeLabel).toBeNull();
    expect(model.venueLabel).toBeNull();
  });

  it("uses the neutral title when the title is blank", () => {
    expect(buildCardModel({ ...full, title: "   " }).title).toBe("Community Session");
  });

  it("uses a photo only when it is an https address", () => {
    expect(buildCardModel({ ...full, photo_url: "javascript:alert(1)" }).photoUrl).toBeNull();
    expect(buildCardModel({ ...full, photo_url: null }).photoUrl).toBeNull();
  });
});

describe("kickerFor and sizes", () => {
  it("picks a kicker from the session's activity", () => {
    expect(kickerFor("Strength & Conditioning")).toBe("Strength & Conditioning");
    expect(kickerFor("Sunday 5K Run")).toBe("Community Run");
    expect(kickerFor("Yoga flow")).toBe("Mobility & Recovery");
    expect(kickerFor("Friday social")).toBe("Community Session");
  });

  it("shrinks a long title so it stays inside the card", () => {
    expect(titleFontSize("Run", "story")).toBeGreaterThan(titleFontSize("A very long session title that wraps", "story"));
  });

  it("gives the story and WhatsApp sizes", () => {
    expect(SHARE_FORMAT_SIZE.story).toEqual({ width: 1080, height: 1920 });
    expect(SHARE_FORMAT_SIZE.whatsapp).toEqual({ width: 1080, height: 1350 });
  });
});
