/**
 * The booking's categories as the registration page shows them: how many runners are in each category, which
 * label and child flag each participant has, what each category line costs, and how the counts change without
 * touching the details already entered.
 *
 * Pure functions only. The server prices and checks the booking itself (app/api/it-run/register/route.ts); the
 * amounts here are what the page shows before that.
 */

import type { ItRunCategory } from "@/lib/it-run-types";
import { bookingPrice, pricedUnits } from "@/lib/it-run-category-rules";

/** One participant's category, label and child flag, read by their position within that category. */
export interface ParticipantSlot {
  categoryId: string;
  category: ItRunCategory | null;
  /** Position within the participant's own category, from 0 */
  position: number;
  label: string;
  role: string;
  isChild: boolean;
  tshirtSizes: string[];
}

/** One category line of the booking: its runners, and what they cost. */
export interface BookingLine {
  category: ItRunCategory;
  count: number;
  listPrice: number;
  discount: number;
  total: number;
}

/** How many participants a category takes at once: a team (2) for duo and kid, one runner for solo. */
export function teamSize(category: ItRunCategory): number {
  return Math.max(1, category.participant_count);
}

/** The runners in each category, as counts keyed by category id. */
export function countsFromCategoryIds(categoryIds: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of categoryIds) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

/** Labels, child flags and t-shirt sizes for every participant, in booking order. */
export function slotsFor(categoryIds: string[], categories: ItRunCategory[]): ParticipantSlot[] {
  const seen = new Map<string, number>();
  const base = categoryIds.map((categoryId, index) => {
    const category = categories.find(c => c.id === categoryId) ?? null;
    const position = seen.get(categoryId) ?? 0;
    seen.set(categoryId, position + 1);
    const label = category ? category.participant_labels[position % teamSize(category)] : undefined;
    return {
      categoryId,
      category,
      position,
      label: label?.label ?? `Participant ${index + 1}`,
      role: label?.role ?? "solo",
      isChild: label?.is_child ?? false,
      tshirtSizes: label?.tshirt_sizes ?? [],
      index,
    };
  });
  // The same label can come up more than once in a booking (two solo runners are both "You"). Each repeat gets its
  // own name: a solo runner is numbered by their place in the booking, a pair by its pair number.
  const uses = new Map<string, number>();
  for (const slot of base) uses.set(slot.label, (uses.get(slot.label) ?? 0) + 1);
  const repeats = new Map<string, number>();
  return base.map(({ index, ...slot }) => {
    if ((uses.get(slot.label) ?? 0) <= 1) return slot;
    const k = (repeats.get(slot.label) ?? 0) + 1;
    repeats.set(slot.label, k);
    if (k === 1) return slot;
    const label = slot.category?.category_type === "solo"
      ? `Participant ${index + 1}`
      : `${slot.label} · pair ${Math.floor(slot.position / teamSize(slot.category ?? { participant_count: 1 } as ItRunCategory)) + 1}`;
    return { ...slot, label };
  });
}

/**
 * The participant list for a new set of counts. Participants already entered keep their details, in the order
 * they were entered, within each category. Counts that go down remove the last participants of that category
 * only. Counts that go up add blank participants.
 */
export function rebuildParticipants<T extends { categoryId: string }>(
  counts: Record<string, number>,
  categories: ItRunCategory[],
  current: T[],
  blank: (categoryId: string) => T,
): T[] {
  const next: T[] = [];
  for (const category of categories) {
    const wanted = counts[category.id] ?? 0;
    if (wanted <= 0) continue;
    const kept = current.filter(p => p.categoryId === category.id).slice(0, wanted);
    next.push(...kept);
    for (let i = kept.length; i < wanted; i++) next.push(blank(category.id));
  }
  return next;
}

/** The booking's first category: the registration's own category, and the one a single-category booking uses. */
export function primaryCategory(categoryIds: string[], categories: ItRunCategory[]): ItRunCategory | null {
  const first = categoryIds[0];
  return categories.find(c => c.id === first) ?? null;
}

/** How many runners a category can still take. Unlimited categories return null. */
export function seatsLeft(category: ItRunCategory): number | null {
  if (category.max_participants == null) return null;
  return Math.max(0, category.max_participants - category.current_participants);
}

/**
 * The most runners the count can go up to in this category: a whole number of teams that still fits the seats left.
 */
export function maxCountFor(category: ItRunCategory): number {
  if (category.is_soldout) return 0;
  const left = seatsLeft(category);
  const team = teamSize(category);
  if (left === null) return 20 * team;
  return Math.floor(left / team) * team;
}

/** The booking's category lines, in event order. Estimates for display; the server sets the amount. */
export function bookingLines(counts: Record<string, number>, categories: ItRunCategory[]): BookingLine[] {
  const lines: BookingLine[] = [];
  for (const category of categories) {
    const count = counts[category.id] ?? 0;
    if (count <= 0) continue;
    const listPrice = bookingPrice(category.category_type, category.price_rupees, count);
    // The early bird's discount is per priced unit (a runner, or a team), so it scales with the units in this line
    const units = pricedUnits(category.category_type, count);
    const discount = Math.min(listPrice, (category.early_bird?.discount ?? 0) * units);
    lines.push({ category, count, listPrice, discount, total: listPrice - discount });
  }
  return lines;
}

export function bookingTotals(lines: BookingLine[]): { listPrice: number; discount: number; total: number } {
  return lines.reduce(
    (sum, line) => ({
      listPrice: sum.listPrice + line.listPrice,
      discount: sum.discount + line.discount,
      total: sum.total + line.total,
    }),
    { listPrice: 0, discount: 0, total: 0 },
  );
}

/** A short description of the booking's categories, for headers and summaries. */
export function bookingSummary(lines: BookingLine[]): string {
  if (lines.length === 0) return "";
  return lines.map(l => (l.count > 1 ? `${l.category.name} × ${l.count}` : l.category.name)).join(" + ");
}
