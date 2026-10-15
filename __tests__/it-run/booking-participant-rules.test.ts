/**
 * Participant-count rules and booking prices. Two separate questions:
 *  - Fixed-composition categories (duo, parent & child) are whole teams of two: one pair is one team, paid once.
 *  - Individual categories (solo) accept one or more runners, and each runner pays the price.
 */

import {
  fixedParticipantCount,
  participantCountAllowed,
  participantCountMessage,
  bookingPrice,
  pricedUnits,
  isChildPosition,
} from "@/lib/it-run-category-rules";

describe("participantCountAllowed", () => {
  it("allows one or more runners in an individual category", () => {
    for (const n of [1, 2, 3, 5]) expect(participantCountAllowed("solo", n)).toBe(true);
  });

  it("refuses an empty or fractional individual booking", () => {
    expect(participantCountAllowed("solo", 0)).toBe(false);
    expect(participantCountAllowed("solo", 1.5)).toBe(false);
  });

  it("takes the Duo Challenge in whole teams of two: 2 or 4 runners, never 1 or 3", () => {
    expect(participantCountAllowed("duo", 2)).toBe(true);
    expect(participantCountAllowed("duo", 4)).toBe(true);
    expect(participantCountAllowed("duo", 1)).toBe(false);
    expect(participantCountAllowed("duo", 3)).toBe(false);
  });

  it("takes the Parent & Child Duo in whole pairs: 2 or 4 people, never 1 or 3", () => {
    expect(participantCountAllowed("kid", 2)).toBe(true);
    expect(participantCountAllowed("kid", 4)).toBe(true);
    expect(participantCountAllowed("kid", 1)).toBe(false);
    expect(participantCountAllowed("kid", 3)).toBe(false);
  });

  it("fixed-composition categories report their team size; individual ones report none", () => {
    expect(fixedParticipantCount("solo")).toBeNull();
    expect(fixedParticipantCount("duo")).toBe(2);
    expect(fixedParticipantCount("kid")).toBe(2);
  });
});

describe("participantCountMessage", () => {
  it("explains a fixed composition in terms of the pairs it needs", () => {
    expect(participantCountMessage("duo", 1)).toBe("The Duo Challenge needs runners in pairs (2 per team). You entered 1.");
    expect(participantCountMessage("kid", 3)).toBe("The Parent & Child Duo needs parent and child pairs (2 people per pair). You entered 3.");
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

  it("charges each pair once: four Duo Challenge runners are two teams", () => {
    expect(bookingPrice("duo", 1499, 4)).toBe(2998);
    expect(bookingPrice("kid", 999, 4)).toBe(1998);
  });

  it("never prices an empty line at zero runners' cost", () => {
    expect(pricedUnits("solo", 0)).toBe(1);
  });
});

describe("parent and child positions", () => {
  it("reads the Parent & Child Duo in pairs: parent, child, parent, child", () => {
    expect([0, 1, 2, 3].map(i => isChildPosition("kid", i))).toEqual([false, true, false, true]);
  });

  it("never marks duo or solo participants as children", () => {
    expect(isChildPosition("duo", 1)).toBe(false);
    expect(isChildPosition("solo", 1)).toBe(false);
  });
});
