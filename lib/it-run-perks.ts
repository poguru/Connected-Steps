/**
 * What a participant gets in a category, shown as icons on the register page. Built from the category's inclusion
 * labels (the same list the server sends), so an admin's flags decide what appears. Unknown labels are ignored, so no
 * perk is shown that the category does not actually include.
 */

export type PerkKey = "bib" | "timing" | "medal" | "tshirt" | "certificate" | "breakfast" | "photos";

export interface Perk {
  key: PerkKey;
  label: string;
}

const PERK_BY_INCLUSION: Record<string, Perk> = {
  "Race BIB": { key: "bib", label: "Race number" },
  "Chip Timing": { key: "timing", label: "Chip timing" },
  "Finisher Medal": { key: "medal", label: "Medal" },
  "Dry-fit T-Shirt": { key: "tshirt", label: "T-shirt" },
  "Digital Certificate": { key: "certificate", label: "Certificate" },
  "Breakfast": { key: "breakfast", label: "Breakfast" },
  "Photos": { key: "photos", label: "Photos" },
};

/** The perks for these inclusions, in the order given, each shown once. */
export function perksFor(inclusions: string[]): Perk[] {
  const seen = new Set<PerkKey>();
  const perks: Perk[] = [];
  for (const name of inclusions) {
    const perk = PERK_BY_INCLUSION[name];
    if (perk && !seen.has(perk.key)) {
      seen.add(perk.key);
      perks.push(perk);
    }
  }
  return perks;
}
