/**
 * The live operations page names each count for what it counts.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/operations-dashboard/page.tsx"), "utf8");

describe("Live operations page wording", () => {
  it("the title and refresh control are plain", () => {
    expect(page).toMatch(/Live operations/);
    expect(page).toMatch(/Refresh every 5 seconds/);
  });

  it("the counts say what they count", () => {
    expect(page).toMatch(/label: "Runners"/);
    expect(page).toMatch(/label: "BIBs handed out"/);
    expect(page).toMatch(/label: "T-shirts given"/);
    expect(page).toMatch(/label: "Staff on duty"/);
  });
});
