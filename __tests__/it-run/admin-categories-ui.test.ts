/**
 * Categories & Prices page: plain headings and field names. The locked fields and the price rule are still stated.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/categories/page.tsx"), "utf8");

describe("Categories & Prices page wording", () => {
  it("the heading and the locked-field note are plain", () => {
    expect(page).toMatch(/Race categories, prices and places/);
    expect(page).toMatch(/cannot be changed, because registrations and links depend on them/);
  });

  it("field names say what they hold", () => {
    expect(page).toMatch(/label="Maximum places"/);
    expect(page).toMatch(/label="Registrations so far"/);
    expect(page).toMatch(/label="Display order"/);
  });

  it("the price rule is still stated", () => {
    expect(page).toMatch(/Price changes apply to new registrations only/);
  });
});
