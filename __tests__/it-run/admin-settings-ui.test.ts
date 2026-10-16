/**
 * Event Settings page: the flag-off and closing-time fields say what they affect.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/settings/page.tsx"), "utf8");

describe("Event Settings page wording", () => {
  it("the flag-off time says it drives the countdown", () => {
    expect(page).toMatch(/Flag-off time \(race start\)/);
    expect(page).toMatch(/The countdown on the event page counts to this time/);
  });

  it("the closing time says BIB numbers follow it", () => {
    expect(page).toMatch(/BIB numbers are allocated after this time/);
  });

  it("the undo button and the confirmation say what they do", () => {
    expect(page).toMatch(/Undo unsaved changes/);
    expect(page).toMatch(/Confirm these important changes/);
  });
});
