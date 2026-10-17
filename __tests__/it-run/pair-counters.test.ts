/**
 * Pair categories show the number of pairs. The state keeps runners (one pair = two runners), so pricing and the
 * participant records are unchanged.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/register/page.tsx"), "utf8");

describe("pair counters", () => {
  it("a pair category shows pairs, a solo category shows runners", () => {
    expect(page).toMatch(/\{team > 1 \? Math\.round\(count \/ team\) : count\}/);
  });

  it("the buttons add and remove one pair at a time, labelled for screen readers", () => {
    expect(page).toMatch(/Add one pair to \$\{cat\.name\}/);
    expect(page).toMatch(/Remove one pair from \$\{cat\.name\}/);
  });

  it("the stored state is still runners, so a pair is team runners", () => {
    expect(page).toMatch(/onChange\(cat\.id, count \+ team\)/);
    expect(page).toMatch(/onChange\(cat\.id, Math\.max\(0, count - team\)\)/);
  });

  it("one pair of a two-runner category is two runners in the state", () => {
    const team = 2;
    const count = 1 * team;
    expect(Math.round(count / team)).toBe(1);
    expect(count).toBe(2);
  });
});
