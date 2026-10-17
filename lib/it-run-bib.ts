/**
 * BIB numbering for The IT Run Sprint-2. Numbers are allocated once registration has closed, by an admin, and
 * never before. The scheme (confirmed by the organisers):
 *
 *   10K Timed              10001, 10002 …        "10" + 3 digits
 *   5K Timed               50001, 50002 …        "5" + 4 digits
 *   5K Fun Run             5F001, 5F002 …        "5F" + 3 digits
 *   5K Duo Challenge       5D001A / 5D001B       "5D" + 3 digits + A (runner 1) or B (runner 2); one serial per team
 *   2K Parent & Child Duo  001P / 001C           3 digits + P (parent) or C (child); one serial per pair
 *
 * Each series counts on from the highest number already allocated in it, so a number is never reused.
 */

import type { CategoryType } from "@/lib/it-run-category-rules";
import { fixedParticipantCount } from "@/lib/it-run-category-rules";

export interface BibSeries {
  /** The text before the serial. */
  prefix: string;
  /** The number of digits in the serial. */
  width: number;
  /** For a team category: the roles of the two members (first, second) and the letter each one carries. */
  team?: { roles: [string, string]; letters: [string, string] };
}

/** One series per category, keyed by the category slug. */
export const BIB_SERIES: Record<string, BibSeries> = {
  "10k-timed":  { prefix: "10", width: 3 },
  "5k-timed":   { prefix: "5",  width: 4 },
  "5k-fun-run": { prefix: "5F", width: 3 },
  "5k-duo":     { prefix: "5D", width: 3, team: { roles: ["primary", "secondary"], letters: ["A", "B"] } },
  "2k-kid":     { prefix: "",   width: 3, team: { roles: ["parent", "child"], letters: ["P", "C"] } },
  // The live category slug (renamed from 2k-kid). Without this key every Parent & Child team is reported as having no series.
  "parent-child-duo": { prefix: "", width: 3, team: { roles: ["parent", "child"], letters: ["P", "C"] } },
};

/** The BIB for a serial, with the team letter when the series has one. */
export function formatBib(series: BibSeries, serial: number, letter?: string): string {
  return `${series.prefix}${String(serial).padStart(series.width, "0")}${letter ?? ""}`;
}

/** The highest serial a series can hold. A series that reaches it is reported rather than overflowing. */
export function maxSerial(series: BibSeries): number {
  return Math.pow(10, series.width) - 1;
}

function seriesPattern(series: BibSeries): RegExp {
  const letters = series.team ? `[${series.team.letters.join("")}]` : "";
  return new RegExp(`^${series.prefix}(\\d{${series.width}})${letters}$`);
}

/**
 * Teams of a booking, by booking order. Each team of a fixed-composition category gets one shared key, so its two
 * members can be paired exactly at allocation. Solo participants get null.
 */
export function teamKeysByIndex(
  categoryIds: string[],
  categoryTypes: Map<string, CategoryType>,
  newKey: () => string,
): Array<string | null> {
  const seen = new Map<string, number>();
  const keys = new Map<string, string>();
  return categoryIds.map(categoryId => {
    const team = fixedParticipantCount(categoryTypes.get(categoryId) ?? "solo");
    if (team === null) return null;
    const position = seen.get(categoryId) ?? 0;
    seen.set(categoryId, position + 1);
    const slot = `${categoryId}:${Math.floor(position / team)}`;
    if (!keys.has(slot)) keys.set(slot, newKey());
    return keys.get(slot)!;
  });
}

export interface BibCandidate {
  participantId: string;
  registrationId: string;
  categorySlug: string;
  participantType: string;
  /** The team this participant belongs to. Null for solo categories and for bookings made before team keys. */
  teamKey: string | null;
  createdAt: string;
}

export interface BibAssignment { participantId: string; bib: string }
export interface BibProblem { registrationId: string; categorySlug: string; reason: string }
export interface BibPlan { assignments: BibAssignment[]; problems: BibProblem[] }

/**
 * Works out the BIB for every candidate. Pure: the caller reads the candidates and the numbers already allocated,
 * and writes the result. A team that cannot be paired cleanly is reported and left unnumbered, so its booking is
 * not sent its BIB email until someone looks at it.
 */
export function planBibNumbers(candidates: BibCandidate[], existingBibs: string[]): BibPlan {
  const assignments: BibAssignment[] = [];
  const problems: BibProblem[] = [];

  // Next serial per series: one past the highest serial already allocated in it.
  const next = new Map<string, number>();
  for (const [slug, series] of Object.entries(BIB_SERIES)) {
    const pattern = seriesPattern(series);
    let highest = 0;
    for (const bib of existingBibs) {
      const m = pattern.exec(bib);
      if (m) highest = Math.max(highest, Number(m[1]));
    }
    next.set(slug, highest + 1);
  }

  const takeSerial = (slug: string, series: BibSeries, registrationId: string): number | null => {
    const serial = next.get(slug) ?? 1;
    if (serial > maxSerial(series)) {
      problems.push({ registrationId, categorySlug: slug, reason: "This BIB series is full" });
      return null;
    }
    next.set(slug, serial + 1);
    return serial;
  };

  const ordered = [...candidates].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
    || a.registrationId.localeCompare(b.registrationId)
    || a.participantId.localeCompare(b.participantId));

  // Solo participants: one BIB each.
  // Teams: grouped by team key. A booking from before team keys is paired by role within its registration and category.
  const teams = new Map<string, BibCandidate[]>();
  for (const c of ordered) {
    const series = BIB_SERIES[c.categorySlug];
    if (!series) {
      problems.push({ registrationId: c.registrationId, categorySlug: c.categorySlug, reason: "This category has no BIB series" });
      continue;
    }
    if (!series.team) {
      const serial = takeSerial(c.categorySlug, series, c.registrationId);
      if (serial !== null) assignments.push({ participantId: c.participantId, bib: formatBib(series, serial) });
      continue;
    }
    const key = c.teamKey ? `team:${c.teamKey}` : `legacy:${c.registrationId}:${c.categorySlug}`;
    const list = teams.get(key) ?? [];
    list.push(c);
    teams.set(key, list);
  }

  for (const [key, members] of teams) {
    const { categorySlug, registrationId } = members[0];
    const series = BIB_SERIES[categorySlug];
    const roles = series.team!.roles;
    const pairs: BibCandidate[][] = [];

    if (key.startsWith("team:")) {
      const first = members.find(m => m.participantType === roles[0]);
      const second = members.find(m => m.participantType === roles[1]);
      if (members.length !== 2 || !first || !second) {
        problems.push({ registrationId, categorySlug, reason: "A team does not have one member of each role" });
        continue;
      }
      pairs.push([first, second]);
    } else {
      // Older bookings: pair the first-role members with the second-role members, in id order.
      const firstRole = members.filter(m => m.participantType === roles[0]).sort((a, b) => a.participantId.localeCompare(b.participantId));
      const secondRole = members.filter(m => m.participantType === roles[1]).sort((a, b) => a.participantId.localeCompare(b.participantId));
      if (firstRole.length !== secondRole.length || firstRole.length + secondRole.length !== members.length) {
        problems.push({ registrationId, categorySlug, reason: "Team members could not be paired from their roles" });
        continue;
      }
      firstRole.forEach((m, i) => pairs.push([m, secondRole[i]]));
    }

    for (const [a, b] of pairs) {
      const serial = takeSerial(categorySlug, series, registrationId);
      if (serial === null) continue;
      assignments.push({ participantId: a.participantId, bib: formatBib(series, serial, series.team!.letters[0]) });
      assignments.push({ participantId: b.participantId, bib: formatBib(series, serial, series.team!.letters[1]) });
    }
  }

  return { assignments, problems };
}
