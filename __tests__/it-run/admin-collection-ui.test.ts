/**
 * The BIB Collection page uses plain words for its live counts.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/bib-collection/page.tsx"), "utf8");

describe("BIB Collection page wording", () => {
  it("the headline and refresh control are plain", () => {
    expect(page).toMatch(/BIB Collection: live status/);
    expect(page).toMatch(/Refresh every 5 seconds/);
  });

  it("the counts say what they count", () => {
    expect(page).toMatch(/label="BIBs still to hand out"/);
    expect(page).toMatch(/label="Exceptions \(refund or no BIB\)"/);
    expect(page).toMatch(/label="T-shirts handed out"/);
  });
});
