/**
 * Seats per category for one registration. A booking can hold runners from several categories, so its seats are
 * counted per category from the participant rows, not from the registration's single category.
 *
 * Callers reserve and release through these helpers so that a booking with mixed categories always gives back
 * exactly the seats it took, in each category.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient;

export interface SeatLine {
  categoryId: string;
  count: number;
}

export type ReserveSeatsResult = "confirmed" | "full" | "unavailable" | "error";

/** Adds up the seats per category, keeping the first-seen order. Zero or negative lines are dropped. */
export function mergeSeatLines(lines: SeatLine[]): SeatLine[] {
  const totals = new Map<string, number>();
  for (const line of lines) {
    if (!line.categoryId || !(line.count > 0)) continue;
    totals.set(line.categoryId, (totals.get(line.categoryId) ?? 0) + line.count);
  }
  return Array.from(totals, ([categoryId, count]) => ({ categoryId, count }));
}

/**
 * Seats per category from participant rows. A participant with no category of their own (a registration made
 * before participants carried one) counts toward the registration's category.
 */
export function seatLinesFromParticipants(
  participants: Array<{ category_id: string | null }>,
  fallbackCategoryId: string,
): SeatLine[] {
  return mergeSeatLines(participants.map(p => ({ categoryId: p.category_id ?? fallbackCategoryId, count: 1 })));
}

/** Total seats across every line. */
export function totalSeats(lines: SeatLine[]): number {
  return lines.reduce((sum, line) => sum + line.count, 0);
}

/**
 * Reserves every line or none. Expired pending bookings are released first, inside the database, under the same
 * locks. Returns "full" when any category is short of seats, and "unavailable" when any is inactive.
 */
export async function reserveSeats(db: Db, lines: SeatLine[], paymentTtlMins = 15): Promise<ReserveSeatsResult> {
  const merged = mergeSeatLines(lines);
  if (merged.length === 0) return "confirmed";
  const { data, error } = await db.rpc("itr_reserve_capacity_multi", {
    p_lines: merged.map(l => ({ category_id: l.categoryId, count: l.count })),
    p_payment_ttl_mins: paymentTtlMins,
  });
  if (error) return "error";
  if (data === "confirmed" || data === "full" || data === "unavailable") return data;
  return "error";
}

/** Gives back the seats of every line. Each category is released separately, as before. */
export async function releaseSeats(db: Db, lines: SeatLine[]): Promise<void> {
  for (const line of mergeSeatLines(lines)) {
    await db.rpc("itr_release_capacity", { p_category_id: line.categoryId, p_count: line.count });
  }
}

/** The seats a stored registration holds, per category, read from its participant rows. */
export async function seatLinesForRegistration(
  db: Db,
  registrationId: string,
  fallback: { categoryId: string; participantCount: number },
): Promise<SeatLine[]> {
  const { data, error } = await db
    .from("it_run_participants")
    .select("category_id")
    .eq("registration_id", registrationId)
    .returns<Array<{ category_id: string | null }>>();
  if (error || !data || data.length === 0) {
    return [{ categoryId: fallback.categoryId, count: fallback.participantCount }];
  }
  return seatLinesFromParticipants(data, fallback.categoryId);
}
