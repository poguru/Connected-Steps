/**
 * The admin check-in page says what to do and uses plain words for its tabs and status.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/checkins/page.tsx"), "utf8");

describe("Check-in page wording", () => {
  it("tells staff what to do", () => {
    expect(page).toMatch(/Scan a runner's QR code or type their BIB number, then check them in/);
  });

  it("tabs and status words are plain", () => {
    expect(page).toMatch(/Scan and check in/);
    expect(page).toMatch(/Who has checked in/);
    expect(page).toMatch(/label="BIB collected"/);
    expect(page).toMatch(/label="T-shirt given"/);
  });
});
