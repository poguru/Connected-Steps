/**
 * A booking's runners, grouped by the category they are in. The IT Run emails go out once per category, so each email
 * lists only the runners in that category. A runner with no category of their own counts toward the booking's category.
 */

export interface CategoryGroup<T> {
  categoryId: string;
  name: string;
  participants: T[];
}

/** Groups in the order each category first appears among the runners. */
export function groupParticipantsByCategory<T extends { category_id: string | null }>(
  participants: T[],
  fallbackCategoryId: string,
  fallbackName: string,
  names: Map<string, string>,
): CategoryGroup<T>[] {
  const groups = new Map<string, CategoryGroup<T>>();
  for (const p of participants) {
    const categoryId = p.category_id ?? fallbackCategoryId;
    let group = groups.get(categoryId);
    if (!group) {
      group = { categoryId, name: names.get(categoryId) ?? (categoryId === fallbackCategoryId ? fallbackName : "IT Run Sprint-2"), participants: [] };
      groups.set(categoryId, group);
    }
    group.participants.push(p);
  }
  return Array.from(groups.values());
}
