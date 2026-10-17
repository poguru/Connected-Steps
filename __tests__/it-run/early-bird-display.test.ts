/**
 * The category card shows an early-bird price clearly: the normal price struck through, an EARLY BIRD badge, the saving,
 * and the unit. A category with no active offer shows only its normal price. The server still decides the price.
 *
 * Source-level checks, like the other register tests: the card is part of a client component.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/register/page.tsx"), "utf8");

describe("category card: early-bird pricing", () => {
  it("shows the normal price struck through only when an early bird applies", () => {
    expect(page).toMatch(/\{cat\.early_bird && \(\s*<div style=\{\{ fontSize: 13, color: "#888", textDecoration: "line-through" \}\}>/);
  });

  it("shows an EARLY BIRD badge and the saving only when an early bird applies", () => {
    expect(page).toMatch(/\{cat\.early_bird && \(\s*<div style=\{\{ display: "flex"/);
    expect(page).toMatch(/EARLY BIRD/);
  });

  it("the saving is the normal price less the early-bird price, never negative", () => {
    expect(page).toMatch(/Math\.max\(0, cat\.price_rupees - price\)/);
  });

  it("the early-bird price itself still comes from the server's offer", () => {
    expect(page).toMatch(/const price = cat\.early_bird \? cat\.early_bird\.finalPrice : cat\.price_rupees;/);
  });

  it("no longer uses the small 'early bird' label that was easy to miss", () => {
    expect(page).not.toMatch(/\{cat\.early_bird \? "early bird · " : ""\}/);
  });

  it("the unit label is per runner or per pair, as before", () => {
    expect(page).toMatch(/\{cat\.category_type === "solo" \? "per runner" : "per pair"\}/);
  });
});
