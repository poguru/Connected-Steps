/**
 * The Collection Slots page says what a slot is for, and what hiding one does.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/bib-slots/page.tsx"), "utf8");

describe("Collection Slots page wording", () => {
  it("explains what a slot is and what hiding one does", () => {
    expect(page).toMatch(/Participants pick one of the active slots to collect their BIB/);
    expect(page).toMatch(/Hiding a slot removes it from what participants can choose/);
  });

  it("the status words and buttons are plain", () => {
    expect(page).toMatch(/Hide from participants/);
    expect(page).toMatch(/Show to participants/);
    expect(page).toMatch(/>\s*Full\s*</);
    expect(page).toMatch(/>\s*Hidden\s*</);
  });

  it("hiding a slot only changes the slot, not bookings", () => {
    const route = fs.readFileSync(path.resolve(__dirname, "../../app/api/it-run/admin/bib-slots/route.ts"), "utf8");
    expect(route).toMatch(/updates\.is_active\s*= Boolean\(body\.is_active\)/);
  });
});
