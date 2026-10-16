/**
 * Feedback page: plain words for the summary, the issue statuses and the rating filters.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/feedback/page.tsx"), "utf8");

describe("Feedback page wording", () => {
  it("issue statuses say what needs doing", () => {
    expect(page).toMatch(/open:\s+\{ color: RED,\s+label: "Needs action"/);
    expect(page).toMatch(/resolved:\s+\{ color: GREEN,\s+label: "Fixed"/);
  });

  it("the NPS terms are explained in plain words", () => {
    expect(page).toMatch(/Recommend score \(NPS\)/);
    expect(page).toMatch(/Very likely \(9–10\)/);
    expect(page).toMatch(/Unlikely \(0–6\)/);
  });

  it("the rating filters say lowest and highest", () => {
    expect(page).toMatch(/Lowest rating/);
    expect(page).toMatch(/Highest rating/);
  });
});
