/**
 * Early bird pricing rules: windows, rounding, caps, quota, best-offer selection, and admin validation.
 */
import {
  inWindow, rawDiscount, grantedDiscount, bestEarlyBird, validateOfferInput, quotaAvailable,
  type EarlyBirdOffer,
} from "@/lib/it-run-early-bird";

const START = "2026-10-20T00:00:00.000Z";
const END = "2027-01-31T23:59:00.000Z";
const T = (iso: string) => Date.parse(iso);

function offer(over: Partial<EarlyBirdOffer> = {}): EarlyBirdOffer {
  return {
    id: "o-1", category_id: "c-5kt", name: "Early Bird", discount_type: "percent", discount_value: 15,
    starts_at: START, ends_at: END, status: "active", redemption_limit: null, redemptions_used: 0,
    min_payable_rupees: 0, ...over,
  };
}

describe("window boundaries (start inclusive, end exclusive)", () => {
  it("is open at the exact start", () => { expect(inWindow(offer(), T(START))).toBe(true); });
  it("is open one millisecond before the end", () => { expect(inWindow(offer(), T(END) - 1)).toBe(true); });
  it("is closed at the exact end", () => { expect(inWindow(offer(), T(END))).toBe(false); });
  it("is closed before the start", () => { expect(inWindow(offer(), T(START) - 1)).toBe(false); });
  it("treats a scheduled offer as not yet running", () => {
    expect(bestEarlyBird(799, [offer()], T("2026-10-19T23:59:59.000Z"))).toBeNull();
  });
});

describe("discount arithmetic (whole rupees, half up)", () => {
  it("15% of ₹799 is ₹119.85, which rounds to ₹120", () => {
    expect(rawDiscount(799, { discount_type: "percent", discount_value: 15 })).toBe(120);
  });
  it("10% of ₹999 is ₹99.9, which rounds to ₹100", () => {
    expect(rawDiscount(999, { discount_type: "percent", discount_value: 10 })).toBe(100);
  });
  it("rounds an exact half up: 50% of ₹99 is ₹49.5, which becomes ₹50", () => {
    expect(rawDiscount(99, { discount_type: "percent", discount_value: 50 })).toBe(50);
  });
  it("fixed discounts are taken as given", () => {
    expect(rawDiscount(649, { discount_type: "fixed", discount_value: 50 })).toBe(50);
  });
  it("a fixed discount never exceeds the base price", () => {
    expect(rawDiscount(100, { discount_type: "fixed", discount_value: 500 })).toBe(100);
  });
});

describe("minimum payable amount", () => {
  it("caps the discount so the price never drops below the minimum", () => {
    const o = offer({ discount_type: "fixed", discount_value: 500, min_payable_rupees: 600 });
    expect(grantedDiscount(799, o)).toBe(199); // 799 - 600
  });
  it("grants nothing when the base price is already at the minimum", () => {
    const o = offer({ discount_type: "percent", discount_value: 10, min_payable_rupees: 999 });
    expect(grantedDiscount(999, o)).toBe(0);
  });
});

describe("quota", () => {
  it("is open with no limit", () => { expect(quotaAvailable(offer())).toBe(true); });
  it("is open while below the limit", () => { expect(quotaAvailable(offer({ redemption_limit: 10, redemptions_used: 9 }))).toBe(true); });
  it("is closed at the limit", () => { expect(quotaAvailable(offer({ redemption_limit: 10, redemptions_used: 10 }))).toBe(false); });
});

describe("best offer per category", () => {
  it("applies the larger discount when two offers overlap", () => {
    const small = offer({ id: "a", discount_value: 10 });
    const big = offer({ id: "b", discount_value: 20 });
    const r = bestEarlyBird(799, [small, big], T("2026-11-01T00:00:00Z"));
    expect(r?.offer.id).toBe("b");
    expect(r?.discount).toBe(160);
    expect(r?.finalPrice).toBe(639);
  });

  it("breaks a tie by the lower id, deterministically", () => {
    const x = offer({ id: "z", discount_value: 10 });
    const y = offer({ id: "m", discount_value: 10 });
    expect(bestEarlyBird(799, [x, y], T("2026-11-01T00:00:00Z"))?.offer.id).toBe("m");
  });

  it("ignores paused, draft, archived, exhausted, and out-of-window offers", () => {
    const now = T("2026-11-01T00:00:00Z");
    const offers = [
      offer({ id: "p", status: "paused" }),
      offer({ id: "d", status: "draft" }),
      offer({ id: "x", status: "archived" }),
      offer({ id: "full", redemption_limit: 5, redemptions_used: 5 }),
      offer({ id: "late", starts_at: "2026-12-01T00:00:00Z", ends_at: "2027-01-01T00:00:00Z" }),
    ];
    expect(bestEarlyBird(799, offers, now)).toBeNull();
  });

  it("returns null when there is no offer at all", () => {
    expect(bestEarlyBird(799, [], T("2026-11-01T00:00:00Z"))).toBeNull();
  });
});

describe("admin validation (server side)", () => {
  const base = 799;
  const good = {
    name: "Early Bird — 5K Timed", category_id: "c-5kt", discount_type: "percent", discount_value: 15,
    starts_at: START, ends_at: END,
  };

  it("accepts a valid offer and returns normalised values", () => {
    const r = validateOfferInput(good, base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ name: "Early Bird — 5K Timed", discount_value: 15, redemption_limit: null, status: "draft" });
  });

  it.each([
    ["a negative value", { discount_value: -5 }],
    ["a zero value", { discount_value: 0 }],
    ["a fractional value", { discount_value: 10.5 }],
    ["a percentage above 90", { discount_value: 91 }],
    ["an end before the start", { ends_at: "2026-10-01T00:00:00Z" }],
    ["an equal start and end", { ends_at: START }],
    ["a name that is too short", { name: "ab" }],
    ["an unknown status", { status: "live" }],
    ["a negative redemption limit", { redemption_limit: -1 }],
    ["a minimum at or above the price", { min_payable_rupees: 799 }],
  ])("rejects %s", (_label, change) => {
    expect(validateOfferInput({ ...good, ...change }, base).ok).toBe(false);
  });

  it("rejects a fixed discount at or above the category price", () => {
    expect(validateOfferInput({ ...good, discount_type: "fixed", discount_value: 799 }, base).ok).toBe(false);
  });
});
