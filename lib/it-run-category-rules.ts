/**
 * Participant rules per category type. The single definition used by the registration API (create, edit,
 * category change, downgrade, refund) and by the event config the registration form reads.
 *
 * Two different questions, kept apart:
 *
 *   fixedParticipantCount  — categories with a fixed composition must have exactly this many people:
 *                            duo (5K Duo Challenge): 2 runners; kid (Parent & Child Duo): a parent and a child.
 *   participantCountAllowed — how many people a booking may hold:
 *                            solo (5K Fun Run, 5K Timed, 10K Timed): one or more individual runners in one booking.
 *
 * Pricing follows the same split (see bookingPrice): an individual runner pays the category price, so a solo
 * booking is priced per participant. A fixed-composition team pays the category price once.
 */

export type CategoryType = "solo" | "duo" | "kid";

/** The exact number of people a fixed-composition category needs. null for individual categories. */
export function fixedParticipantCount(categoryType: CategoryType): number | null {
  return categoryType === "solo" ? null : 2;
}

/** Whether a booking of this many people is valid for the category. */
export function participantCountAllowed(categoryType: CategoryType, count: number): boolean {
  if (!Number.isInteger(count) || count < 1) return false;
  const fixed = fixedParticipantCount(categoryType);
  return fixed === null ? true : count === fixed;
}

/** The message shown when a booking's participant count is not valid for its category. */
export function participantCountMessage(categoryType: CategoryType, count: number): string {
  const fixed = fixedParticipantCount(categoryType);
  if (fixed === null) return "Add at least one participant to this booking.";
  if (categoryType === "kid") {
    return `The Parent & Child Duo needs exactly ${fixed} people (a parent and a child). You entered ${count}.`;
  }
  return `The Duo Challenge needs exactly ${fixed} runners. You entered ${count}.`;
}

/** How many category prices a booking pays: one per runner for individual categories, one per team otherwise. */
export function pricedUnits(categoryType: CategoryType, participantCount: number): number {
  return categoryType === "solo" ? Math.max(1, participantCount) : 1;
}

/** The booking's price before any discount. Discounts apply once to this total, never per participant. */
export function bookingPrice(categoryType: CategoryType, pricePerUnit: number, participantCount: number): number {
  return pricePerUnit * pricedUnits(categoryType, participantCount);
}

export function categoryTypeLabel(categoryType: CategoryType): string {
  switch (categoryType) {
    case "solo": return "This category";
    case "duo":  return "The Duo Challenge";
    case "kid":  return "The Parent & Child Duo";
  }
}
