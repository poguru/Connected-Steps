/**
 * The Payments page says what each figure and column means.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/payments/page.tsx"), "utf8");

describe("Payments page wording", () => {
  it("the summary tiles say what they count", () => {
    expect(page).toMatch(/label="Registrations shown"/);
    expect(page).toMatch(/label="Paid so far \(this list\)"/);
  });

  it("the confirmation column is named for what it shows", () => {
    expect(page).toMatch(/"Confirmation sent"/);
    expect(page).not.toMatch(/"Email Sent"/);
  });

  it("the search and empty state are plain", () => {
    expect(page).toMatch(/Search registration code, email or Razorpay payment ID/);
    expect(page).toMatch(/No payments match these filters\./);
  });
});
