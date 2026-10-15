/**
 * The register page's booking helpers: which label and child flag each participant has, how counts change without
 * losing entered details, and the amounts shown per category line.
 */

import type { ItRunCategory } from "@/lib/it-run-types";
import {
  countsFromCategoryIds, slotsFor, rebuildParticipants, primaryCategory, maxCountFor,
  bookingLines, bookingTotals, bookingSummary,
} from "@/lib/it-run-booking";

function cat(over: Partial<ItRunCategory> & Pick<ItRunCategory, "id" | "name" | "category_type" | "price_rupees">): ItRunCategory {
  const labels = {
    solo: [{ role: "solo", label: "You", is_child: false, tshirt_sizes: ["M"] }],
    duo: [
      { role: "primary", label: "Runner 1 (You)", is_child: false, tshirt_sizes: ["M"] },
      { role: "secondary", label: "Runner 2", is_child: false, tshirt_sizes: ["M"] },
    ],
    kid: [
      { role: "parent", label: "Parent", is_child: false, tshirt_sizes: ["M"] },
      { role: "child", label: "Child", is_child: true, tshirt_sizes: ["9-10Y"] },
    ],
  }[over.category_type ?? "solo"];
  return {
    slug: over.id, distance_km: 5, description: null, color: "#e8620a", is_timed: false, inclusions: [],
    participant_count: over.category_type === "solo" ? 1 : 2, participant_labels: labels,
    max_participants: null, current_participants: 0, is_soldout: false, early_bird: null,
    ...over,
  } as ItRunCategory;
}

const SOLO = cat({ id: "solo", name: "10K Timed Run", category_type: "solo", price_rupees: 999 });
const DUO = cat({ id: "duo", name: "5K Duo Challenge", category_type: "duo", price_rupees: 1399 });
const KID = cat({ id: "kid", name: "Parent & Child Duo", category_type: "kid", price_rupees: 999 });
const CATS = [SOLO, DUO, KID];

describe("slotsFor", () => {
  it("gives each participant their category's label, read by position within that category", () => {
    const slots = slotsFor(["solo", "duo", "duo", "kid", "kid"], CATS);
    expect(slots.map(s => s.label)).toEqual(["You", "Runner 1 (You)", "Runner 2", "Parent", "Child"]);
    expect(slots.map(s => s.position)).toEqual([0, 0, 1, 0, 1]);
  });

  it("reads parent and child in pairs when a kid category holds two pairs", () => {
    const slots = slotsFor(["kid", "kid", "kid", "kid"], CATS);
    expect(slots.map(s => s.isChild)).toEqual([false, true, false, true]);
    expect(slots[1].tshirtSizes).toEqual(["9-10Y"]);
  });

  it("keeps a participant whose category is unknown visible, with a fallback label", () => {
    const [slot] = slotsFor(["unknown"], CATS);
    expect(slot.category).toBeNull();
    expect(slot.label).toBe("Participant 1");
    expect(slot.isChild).toBe(false);
  });
});

describe("rebuildParticipants", () => {
  type P = { categoryId: string; name: string };
  const blank = (categoryId: string): P => ({ categoryId, name: "" });

  it("keeps entered details when another category's count changes", () => {
    const current: P[] = [
      { categoryId: "solo", name: "Asha" },
      { categoryId: "duo", name: "Bala" },
      { categoryId: "duo", name: "Chitra" },
    ];
    const next = rebuildParticipants({ solo: 1, duo: 2, kid: 2 }, CATS, current, blank);
    expect(next.map(p => p.name)).toEqual(["Asha", "Bala", "Chitra", "", ""]);
    expect(next.map(p => p.categoryId)).toEqual(["solo", "duo", "duo", "kid", "kid"]);
  });

  it("removes the last participants of a category only, leaving the others untouched", () => {
    const current: P[] = [
      { categoryId: "solo", name: "Asha" },
      { categoryId: "solo", name: "Bala" },
      { categoryId: "duo", name: "Chitra" },
      { categoryId: "duo", name: "Dev" },
    ];
    const next = rebuildParticipants({ solo: 1, duo: 2 }, CATS, current, blank);
    expect(next.map(p => p.name)).toEqual(["Asha", "Chitra", "Dev"]);
  });

  it("keeps the event's category order, whatever order the counts were chosen in", () => {
    const next = rebuildParticipants({ kid: 2, solo: 1 }, CATS, [], blank);
    expect(next.map(p => p.categoryId)).toEqual(["solo", "kid", "kid"]);
  });
});

describe("primaryCategory and counts", () => {
  it("the booking's first participant's category is its primary category", () => {
    expect(primaryCategory(["duo", "solo"], CATS)?.id).toBe("duo");
    expect(primaryCategory([], CATS)).toBeNull();
  });

  it("counts the runners in each category", () => {
    expect(countsFromCategoryIds(["solo", "duo", "duo"])).toEqual({ solo: 1, duo: 2 });
  });
});

describe("maxCountFor", () => {
  it("takes a whole number of teams that fit the seats left", () => {
    const nearlyFull = cat({ id: "d", name: "Duo", category_type: "duo", price_rupees: 1399, max_participants: 5, current_participants: 1 });
    expect(maxCountFor(nearlyFull)).toBe(4); // 4 seats left: two teams fit
    const oneLeft = cat({ id: "d", name: "Duo", category_type: "duo", price_rupees: 1399, max_participants: 5, current_participants: 4 });
    expect(maxCountFor(oneLeft)).toBe(0); // a team needs two seats
  });

  it("is zero for a sold-out category", () => {
    expect(maxCountFor(cat({ id: "s", name: "S", category_type: "solo", price_rupees: 1, is_soldout: true }))).toBe(0);
  });
});

describe("bookingLines and totals", () => {
  it("prices each line on its own: solo per runner, duo and kid per pair", () => {
    const lines = bookingLines({ solo: 2, duo: 2, kid: 4 }, CATS);
    expect(lines.map(l => l.listPrice)).toEqual([999 * 2, 1399, 999 * 2]);
    expect(bookingTotals(lines).listPrice).toBe(999 * 2 + 1399 + 999 * 2);
  });

  it("applies an early bird per line, on the units in that line", () => {
    const earlyDuo = cat({
      id: "duo", name: "Duo", category_type: "duo", price_rupees: 1399,
      early_bird: { name: "EB", discount: 100, finalPrice: 1299, endsAt: "2027-01-01T00:00:00Z" },
    });
    const lines = bookingLines({ duo: 4 }, [earlyDuo]);
    expect(lines[0].listPrice).toBe(2798);
    expect(lines[0].discount).toBe(200); // two teams, 100 each
    expect(lines[0].total).toBe(2598);
  });

  it("never discounts a line below nothing", () => {
    const tiny = cat({
      id: "s", name: "S", category_type: "solo", price_rupees: 50,
      early_bird: { name: "EB", discount: 500, finalPrice: 0, endsAt: "2027-01-01T00:00:00Z" },
    });
    expect(bookingLines({ s: 1 }, [tiny])[0].total).toBe(0);
  });

  it("summarises the booking's categories, showing runners where there is more than one", () => {
    expect(bookingSummary(bookingLines({ solo: 1, duo: 2 }, CATS))).toBe("10K Timed Run + 5K Duo Challenge × 2");
    expect(bookingSummary(bookingLines({ solo: 3 }, CATS))).toBe("10K Timed Run × 3");
    expect(bookingSummary([])).toBe("");
  });
});

describe("slot labels stay distinct within a booking", () => {
  it("numbers a second solo runner by their place in the booking", () => {
    const labels = slotsFor(["solo", "solo", "duo", "duo"], CATS).map(s => s.label);
    expect(labels).toEqual(["You", "Participant 2", "Runner 1 (You)", "Runner 2"]);
  });

  it("gives each further pair its own number, so two duo pairs read differently", () => {
    const labels = slotsFor(["duo", "duo", "duo", "duo"], CATS).map(s => s.label);
    expect(labels).toEqual(["Runner 1 (You)", "Runner 2", "Runner 1 (You) · pair 2", "Runner 2 · pair 2"]);
  });
});
