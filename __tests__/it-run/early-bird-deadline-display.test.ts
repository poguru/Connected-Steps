/**
 * The category card shows when each early-bird offer ends, in IST, and only when an offer applies.
 * The server already stops the discount at the end time (see the early-bird rules tests).
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/register/page.tsx"), "utf8");

describe("early-bird deadline on the category card", () => {
  it("shows the end time from the offer, only when an offer applies", () => {
    expect(page).toMatch(/\{cat\.early_bird\?\.endsAt && \(/);
    expect(page).toMatch(/Offer ends \{formatIst\(cat\.early_bird\.endsAt\)\}/);
  });
});
