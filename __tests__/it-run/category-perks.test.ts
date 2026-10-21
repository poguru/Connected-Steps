/**
 * Perk icons on the register page: each category shows only what it includes, in the server's order, each once.
 * Nothing is invented: a perk without a matching inclusion label is never shown.
 */

import fs from "fs";
import path from "path";
import { perksFor } from "@/lib/it-run-perks";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

describe("perksFor", () => {
  it("maps each known inclusion to its perk", () => {
    expect(perksFor(["Race BIB", "Chip Timing", "Finisher Medal", "Dry-fit T-Shirt", "Digital Certificate", "Breakfast"]).map(p => p.key))
      .toEqual(["bib", "timing", "medal", "tshirt", "certificate", "breakfast"]);
  });

  it("keeps only what the category includes, in the order given", () => {
    expect(perksFor(["Race BIB", "Finisher Medal"]).map(p => p.label)).toEqual(["Race number", "Medal"]);
  });

  it("shows each perk once, and ignores unknown labels", () => {
    expect(perksFor(["Race BIB", "Race BIB", "Hydration pack", "Finisher Medal"]).map(p => p.key)).toEqual(["bib", "medal"]);
  });

  it("returns nothing for an empty or unknown list", () => {
    expect(perksFor([])).toEqual([]);
    expect(perksFor(["First aid kit"])).toEqual([]);
  });
});

describe("breakfast is part of every category", () => {
  it("the event config adds Breakfast to each category's inclusions", () => {
    const route = read("app/api/it-run/event-config/route.ts");
    expect(route).toMatch(/inclusions\.push\("Breakfast"\)/);
  });
});

describe("the register page shows the perks on each category card", () => {
  const page = read("app/it-run/register/page.tsx");

  it("renders the icon row from the category's inclusions, in the card's left column", () => {
    expect(page).toMatch(/<ItRunPerkIcons perks=\{perksFor\(cat\.inclusions\)\} color=\{cat\.color\} \/>/);
  });

  it("the icon row is responsive and keeps the card's text from overflowing", () => {
    const icons = read("components/ItRunPerkIcons.tsx");
    expect(icons).toMatch(/flexWrap: "wrap"/);
    expect(icons).toMatch(/aria-hidden="true"/);
  });
});
