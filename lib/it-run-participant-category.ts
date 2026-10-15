/**
 * The category each participant is registered in, for the admin and participant views. A participant can be in a
 * different category from the rest of their booking, so their category is read from their own row, not from the
 * registration.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ParticipantCategory {
  name: string;
  color: string | null;
}

/** Names and colours for the given category ids. A failed lookup returns an empty map and never fails the list. */
export async function participantCategoryMap(db: SupabaseClient, categoryIds: string[]): Promise<Map<string, ParticipantCategory>> {
  const map = new Map<string, ParticipantCategory>();
  const ids = Array.from(new Set(categoryIds.filter(Boolean)));
  if (ids.length === 0) return map;
  const { data, error } = await db
    .from("it_run_categories")
    .select("id, name, color")
    .in("id", ids)
    .returns<Array<{ id: string; name: string; color: string | null }>>();
  if (error) {
    console.error("[it-run/participant-category] category lookup failed:", error.code ?? "unknown");
    return map;
  }
  for (const c of data ?? []) map.set(c.id, { name: c.name, color: c.color });
  return map;
}

/**
 * The category a participant is in: their own category if they have one, otherwise the registration's category
 * (rows made before participants carried a category).
 */
export function categoryOfParticipant(
  categoryId: string | null | undefined,
  categories: Map<string, ParticipantCategory>,
  registrationCategory: ParticipantCategory | null,
): ParticipantCategory | null {
  if (categoryId && categories.has(categoryId)) return categories.get(categoryId) ?? null;
  return registrationCategory;
}
