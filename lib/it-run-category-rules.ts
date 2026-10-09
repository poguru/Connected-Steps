/**
 * Participant count rules per category type. The single definition used by the registration API
 * (create and edit) and by the event config the registration form reads.
 *
 *   solo  (10K, 5K Timed, 5K Fun Run): 1 runner
 *   duo   (5K Duo Challenge):           2 runners
 *   kid   (Parent & Child Duo):         2 people, a parent and a child
 */

export type CategoryType = "solo" | "duo" | "kid";

export function requiredParticipantCount(categoryType: CategoryType): number {
  return categoryType === "solo" ? 1 : 2;
}

export function categoryTypeLabel(categoryType: CategoryType): string {
  switch (categoryType) {
    case "solo": return "This category";
    case "duo":  return "The Duo Challenge";
    case "kid":  return "The Parent & Child Duo";
  }
}
