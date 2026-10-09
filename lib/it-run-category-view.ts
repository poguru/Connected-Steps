/**
 * Category cards for the IT Run landing page, built ONLY from the category record
 * (it_run_categories, served by /api/it-run/categories). Nothing about a category is hardcoded, so an
 * admin edit appears on the next page load. The badge and colour are derived from stored fields.
 */

export interface ApiCategory {
  slug: string;
  name: string;
  distance_km: number;
  category_type: "solo" | "duo" | "kid";
  price_rupees: number;
  color: string;
  includes_timing: boolean;
  includes_medal: boolean;
  includes_tshirt: boolean;
  includes_certificate: boolean;
}

export interface CategoryCard {
  slug: string;
  name: string;
  distance: string;
  price: number;
  type: "solo" | "duo" | "kid";
  badge: string;
  color: string;
  bgGradient: string;
  includes: string[];
  highlights: string[];
}

const FALLBACK_COLOR = "#e8620a";

/** Formats the stored distance exactly as the database holds it, e.g. 1.5 -> "1.5 KM", 10 -> "10 KM". */
export function formatDistance(km: number): string {
  return `${km} KM`;
}

export function categoryCard(c: ApiCategory): CategoryCard {
  const hex = /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : FALLBACK_COLOR;
  const includes = ["Race BIB"];
  if (c.includes_tshirt) includes.push("Dry-fit T-Shirt");
  if (c.includes_timing) includes.push("Chip Timing");
  if (c.includes_medal) includes.push("Finisher Medal");
  if (c.includes_certificate) includes.push("Digital Certificate");

  return {
    slug: c.slug,
    name: c.name,
    distance: formatDistance(c.distance_km),
    price: c.price_rupees,
    type: c.category_type,
    badge: c.category_type === "kid" ? "FAMILY" : c.includes_timing ? "TIMED" : "RUN",
    color: hex,
    bgGradient: `linear-gradient(135deg, ${hex}26, ${hex}0d)`,
    includes,
    highlights: c.category_type === "kid" ? ["Parent + Child"] : c.includes_timing ? ["Chip timed"] : [],
  };
}
