/**
 * Reports page: plain heading, and downloads described as spreadsheets.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/reports/page.tsx"), "utf8");

describe("Reports page wording", () => {
  it("heading and subtitle are plain", () => {
    expect(page).toMatch(/>Reports<\/h1>/);
    expect(page).toMatch(/Download a spreadsheet to check, print or share/);
  });

  it("the download button says what it downloads", () => {
    expect(page).toMatch(/Download spreadsheet/);
    expect(page).not.toMatch(/Download CSV\n/);
  });

  it("the report links still point at the same report types", () => {
    expect(page).toMatch(/\/api\/it-run\/admin\/reports\?type=\$\{r\.type\}/);
  });
});
