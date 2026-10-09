/**
 * Category selection rules for the IT Run registration page.
 *
 * The category the participant asked for (the ?category= link from the event page, or a card they
 * click) is always the one that opens. A saved draft never silently replaces it, and a missing or
 * invalid category never falls back to another category.
 */

export interface CategoryRef {
  id: string;
  slug: string;
  name: string;
  is_soldout: boolean;
}

export type UrlCategoryDecision<T> =
  | { kind: "none" }                                  // no category in the link: show the category list
  | { kind: "select"; category: T }                   // open this category as the registration
  | { kind: "keep-draft"; category: T }               // the saved draft is this category: let the resume banner restore it
  | { kind: "error"; message: string };               // invalid or sold-out link: the participant chooses below

/**
 * Decides what a ?category= link should do. The draft's category, if any, only changes the outcome
 * when it is the same category (then the saved draft is offered for resume, not overwritten).
 */
export function decideUrlCategory<T extends CategoryRef>(
  slug: string | null,
  categories: T[],
  draftCategoryId: string | null,
): UrlCategoryDecision<T> {
  if (!slug || !slug.trim()) return { kind: "none" };

  const cat = categories.find(c => c.slug === slug.trim().toLowerCase());
  if (!cat) {
    return { kind: "error", message: "That race link is no longer valid. Please choose your category below." };
  }
  if (cat.is_soldout) {
    return { kind: "error", message: `${cat.name} is sold out. Please choose another category below.` };
  }
  if (draftCategoryId && draftCategoryId === cat.id) {
    return { kind: "keep-draft", category: cat };
  }
  return { kind: "select", category: cat };
}

/**
 * True when choosing `nextId` starts a different registration from the one currently loaded.
 * Registration IDs, payment order, draft token, and coupon belong to one category and must be cleared.
 */
export function startsNewRegistration(currentId: string | null | undefined, nextId: string): boolean {
  return !currentId || currentId !== nextId;
}
