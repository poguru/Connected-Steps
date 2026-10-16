/**
 * Coupons page: plain status words and form labels.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/coupons/page.tsx"), "utf8");

describe("Coupons page wording", () => {
  it("each coupon shows its status in words", () => {
    expect(page).toMatch(/exhausted: "Used up"/);
    expect(page).toMatch(/scheduled: "Starts later"/);
    expect(page).toMatch(/COUPON_STATUS_WORD\[st\] \?\? st/);
  });

  it("the form labels say what they mean", () => {
    expect(page).toMatch(/label="Kind of code"/);
    expect(page).toMatch(/Most times it can be used \(blank = no limit\)/);
    expect(page).toMatch(/Only for bookings of at least/);
  });

  it("the values sent to the API are unchanged", () => {
    expect(page).toMatch(/<option value="generic">Shared code \(many uses\)<\/option>/);
    expect(page).toMatch(/<option value="unique">Single-use code<\/option>/);
  });
});
