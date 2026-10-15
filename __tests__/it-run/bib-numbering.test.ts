/**
 * BIB numbering for The IT Run Sprint-2: the series format, the next number in each series, team pairing, and the
 * team keys stamped at registration.
 */

import { BIB_SERIES, formatBib, planBibNumbers, teamKeysByIndex, type BibCandidate } from "@/lib/it-run-bib";

function solo(id: string, slug: string, createdAt = "2026-11-01T10:00:00Z", registrationId = `reg-${id}`): BibCandidate {
  return { participantId: id, registrationId, categorySlug: slug, participantType: "solo", teamKey: null, createdAt };
}

function member(id: string, slug: string, role: string, teamKey: string | null, registrationId = "reg-1"): BibCandidate {
  return { participantId: id, registrationId, categorySlug: slug, participantType: role, teamKey, createdAt: "2026-11-01T10:00:00Z" };
}

describe("formatBib", () => {
  it("writes each series in its confirmed format", () => {
    expect(formatBib(BIB_SERIES["10k-timed"], 1)).toBe("10001");
    expect(formatBib(BIB_SERIES["5k-timed"], 1)).toBe("50001");
    expect(formatBib(BIB_SERIES["5k-fun-run"], 1)).toBe("5F001");
    expect(formatBib(BIB_SERIES["5k-duo"], 1, "A")).toBe("5D001A");
    expect(formatBib(BIB_SERIES["5k-duo"], 1, "B")).toBe("5D001B");
    expect(formatBib(BIB_SERIES["2k-kid"], 1, "P")).toBe("001P");
    expect(formatBib(BIB_SERIES["2k-kid"], 1, "C")).toBe("001C");
  });

  it("keeps the width of the serial, padding with zeros", () => {
    expect(formatBib(BIB_SERIES["5k-timed"], 42)).toBe("50042");
    expect(formatBib(BIB_SERIES["5k-duo"], 12, "B")).toBe("5D012B");
  });
});

describe("planBibNumbers: solo categories", () => {
  it("numbers each series from its first serial, in booking order", () => {
    const plan = planBibNumbers([
      solo("b", "10k-timed", "2026-11-01T10:05:00Z"),
      solo("a", "10k-timed", "2026-11-01T10:00:00Z"),
      solo("c", "5k-timed"),
      solo("d", "5k-fun-run"),
    ], []);
    expect(plan.problems).toEqual([]);
    const bibs = Object.fromEntries(plan.assignments.map(a => [a.participantId, a.bib]));
    expect(bibs).toEqual({ a: "10001", b: "10002", c: "50001", d: "5F001" });
  });

  it("carries on from the highest number already allocated in its series", () => {
    const plan = planBibNumbers([solo("a", "10k-timed"), solo("b", "5k-timed")], ["10007", "50003", "5F009", "5D004A"]);
    const bibs = Object.fromEntries(plan.assignments.map(a => [a.participantId, a.bib]));
    expect(bibs).toEqual({ a: "10008", b: "50004" });
  });
});

describe("planBibNumbers: teams", () => {
  it("gives a duo team one serial with A for the first runner and B for the second", () => {
    const plan = planBibNumbers([
      member("r1", "5k-duo", "primary", "team-x"),
      member("r2", "5k-duo", "secondary", "team-x"),
      member("s1", "5k-duo", "primary", "team-y"),
      member("s2", "5k-duo", "secondary", "team-y"),
    ], []);
    const bibs = Object.fromEntries(plan.assignments.map(a => [a.participantId, a.bib]));
    expect(bibs).toEqual({ r1: "5D001A", r2: "5D001B", s1: "5D002A", s2: "5D002B" });
  });

  it("gives a parent and child pair one serial with P for the parent and C for the child", () => {
    const plan = planBibNumbers([
      member("p1", "2k-kid", "parent", "pair-1"),
      member("c1", "2k-kid", "child", "pair-1"),
    ], []);
    const bibs = Object.fromEntries(plan.assignments.map(a => [a.participantId, a.bib]));
    expect(bibs).toEqual({ p1: "001P", c1: "001C" });
  });

  it("reports a team with a missing member and numbers nothing for it", () => {
    const plan = planBibNumbers([member("r1", "5k-duo", "primary", "team-x")], []);
    expect(plan.assignments).toEqual([]);
    expect(plan.problems).toEqual([expect.objectContaining({ registrationId: "reg-1", categorySlug: "5k-duo" })]);
  });

  it("pairs an older booking (no team key) by role within its registration", () => {
    const plan = planBibNumbers([
      member("r2", "5k-duo", "secondary", null),
      member("r1", "5k-duo", "primary", null),
    ], []);
    const bibs = Object.fromEntries(plan.assignments.map(a => [a.participantId, a.bib]));
    expect(bibs).toEqual({ r1: "5D001A", r2: "5D001B" });
    expect(plan.problems).toEqual([]);
  });

  it("reports an older booking whose roles do not pair", () => {
    const plan = planBibNumbers([
      member("r1", "5k-duo", "primary", null),
      member("r2", "5k-duo", "primary", null),
    ], []);
    expect(plan.assignments).toEqual([]);
    expect(plan.problems).toHaveLength(1);
  });
});

describe("teamKeysByIndex", () => {
  it("gives each pair of a team category one shared key, and solo participants none", () => {
    const types = new Map([["duo", "duo" as const], ["kid", "kid" as const], ["solo", "solo" as const]]);
    let n = 0;
    const keys = teamKeysByIndex(["duo", "duo", "duo", "duo", "kid", "kid", "solo"], types, () => `k${++n}`);
    expect(keys).toEqual(["k1", "k1", "k2", "k2", "k3", "k3", null]);
  });
});
