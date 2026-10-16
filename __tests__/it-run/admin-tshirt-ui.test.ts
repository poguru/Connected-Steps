/**
 * T-shirt inventory page: "handed out" wording throughout, and the load-error message kept.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/tshirt/page.tsx"), "utf8");

describe("T-shirt inventory page wording", () => {
  it("heading and tiles say what the counts are", () => {
    expect(page).toMatch(/T-shirt inventory/);
    expect(page).toMatch(/label="Shirts needed"/);
    expect(page).toMatch(/label="Shirts handed out"/);
  });

  it("filters and notes say handed out, not issued", () => {
    expect(page).toMatch(/<option value="yes">Handed out<\/option>/);
    expect(page).toMatch(/<option value="no">Not yet handed out<\/option>/);
    expect(page).toMatch(/means the runner collected their BIB/);
  });

  it("the load-error message from the earlier fix is still shown", () => {
    expect(page).toMatch(/loadError/);
  });
});
