/**
 * Participant-count rules and booking prices. Two separate questions:
 *  - Fixed-composition categories (duo, parent & child) need exactly their composition.
 *  - Individual categories (solo) accept one or more runners in one booking, and each runner pays the price.
 */

import {
  fixedParticipantCount,
  participantCountAllowed,
  participantCountMessage,
  bookingPrice,
  pricedUnits,
} from "@/lib/it-run-category-rules";

describe("participantCountAllowed", () => {
  it("allows one or more runners in an individual category", () => {
    for (const n of [1, 2, 3, 5]) expect(participantCountAllowed("solo", n)).toBe(true);
  });

  it("refuses an empty or fractional individual booking", () => {
    expect(participantCountAllowed("solo", 0)).toBe(false);
    expect(participantCountAllowed("solo", 1.5)).toBe(false);
  });

  it("requires exactly two runners for the Duo Challenge", () => {
    expect(participantCountAllowed("duo", 2)).toBe(true);
    expect(participantCountAllowed("duo", 1)).toBe(false);
    expect(participantCountAllowed("duo", 3)).toBe(false);
  });

  it("requires exactly a parent and a child for the Parent & Child Duo", () => {
    expect(participantCountAllowed("kid", 2)).toBe(true);
    expect(participantCountAllowed("kid", 1)).toBe(false);
    expect(participantCountAllowed("kid", 3)).toBe(false);
  });

  it("fixed-composition categories report their composition; individual ones report none", () => {
    expect(fixedParticipantCount("solo")).toBeNull();
    expect(fixedParticipantCount("duo")).toBe(2);
    expect(fixedParticipantCount("kid")).toBe(2);
  });
});

describe("participantCountMessage", () => {
  it("explains a fixed composition in terms of the people it needs", () => {
    expect(participantCountMessage("duo", 1)).toBe("The Duo Challenge needs exactly 2 runners. You entered 1.");
    expect(participantCountMessage("kid", 3)).toMatch(/exactly 2 people \(a parent and a child\)\. You entered 3\./);
  });

  it("asks an individual booking for at least one runner", () => {
    expect(participantCountMessage("solo", 0)).toBe("Add at least one participant to this booking.");
  });
});

describe("booking price", () => {
  it("prices an individual booking per runner", () => {
    expect(pricedUnits("solo", 1)).toBe(1);
    expect(pricedUnits("solo", 2)).toBe(2);
    expect(bookingPrice("solo", 999, 1)).toBe(999);
    expect(bookingPrice("solo", 999, 2)).toBe(1998);
    expect(bookingPrice("solo", 799, 3)).toBe(2397);
  });

  it("charges a fixed team once, however it is counted", () => {
    expect(bookingPrice("duo", 1499, 2)).toBe(1499);
    expect(bookingPrice("kid", 999, 2)).toBe(999);
  });

  it("never prices an empty booking at zero runners' cost", () => {
    expect(pricedUnits("solo", 0)).toBe(1);
  });
});
