/**
 * Participant rules per category type. The single definition used by the registration API (create, edit,
 * category change, downgrade, refund) and by the event config the registration form reads.
 *
 * Two different questions, kept apart:
 *
 *   fixedParticipantCount  — categories with a fixed composition are made of teams of this many people:
 *                            duo (5K Duo Challenge): 2 runners per team; kid (Parent & Child Duo): a parent and a child.
 *   participantCountAllowed — how many people one category may hold in a booking:
 *                            solo (5K Fun Run, 5K Timed, 10K Timed): one or more individual runners.
 *                            duo / kid: whole teams only, so an even number (2 = one team, 4 = two teams).
 *
 * Pricing follows the same split (see bookingPrice): an individual runner pays the category price, so a solo
 * line is priced per runner. A fixed-composition team pays the category price once.
 */

export type CategoryType = "solo" | "duo" | "kid";

/** The number of people in one team of a fixed-composition category. null for individual categories. */
export function fixedParticipantCount(categoryType: CategoryType): number | null {
  return categoryType === "solo" ? null : 2;
}

/** Whether this many people may be booked into one category. */
export function participantCountAllowed(categoryType: CategoryType, count: number): boolean {
  if (!Number.isInteger(count) || count < 1) return false;
  const team = fixedParticipantCount(categoryType);
  return team === null ? true : count % team === 0;
}

/** The message shown when a category's participant count is not valid. */
export function participantCountMessage(categoryType: CategoryType, count: number): string {
  const team = fixedParticipantCount(categoryType);
  if (team === null) return "Add at least one participant to this booking.";
  if (categoryType === "kid") {
    return `The Parent & Child Duo needs parent and child pairs (${team} people per pair). You entered ${count}.`;
  }
  return `The Duo Challenge needs runners in pairs (${team} per team). You entered ${count}.`;
}

/** How many category prices a line pays: one per runner for individual categories, one per team otherwise. */
export function pricedUnits(categoryType: CategoryType, participantCount: number): number {
  const team = fixedParticipantCount(categoryType);
  if (team === null) return Math.max(1, participantCount);
  return Math.max(1, Math.floor(participantCount / team));
}

/** The line's price before any discount. Discounts apply once to the booking total, never per participant. */
export function bookingPrice(categoryType: CategoryType, pricePerUnit: number, participantCount: number): number {
  return pricePerUnit * pricedUnits(categoryType, participantCount);
}

/**
 * Whether the participant at this position within their category is the child of a parent and child pair.
 * Pairs are read in order: positions 0, 2, 4... are parents and 1, 3, 5... are children.
 */
export function isChildPosition(categoryType: CategoryType, indexInCategory: number): boolean {
  return categoryType === "kid" && indexInCategory % 2 === 1;
}

export function categoryTypeLabel(categoryType: CategoryType): string {
  switch (categoryType) {
    case "solo": return "This category";
    case "duo":  return "The Duo Challenge";
    case "kid":  return "The Parent & Child Duo";
  }
}
