/**
 * Refund status page: plain title, summary words and row statuses.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/refund-reconciliation/page.tsx"), "utf8");

describe("Refund status page wording", () => {
  it("title and purpose are plain", () => {
    expect(page).toMatch(/Refund status/);
    expect(page).toMatch(/Checks each refund against Razorpay/);
  });

  it("statuses show in words in the tabs and the rows", () => {
    expect(page).toMatch(/pending: "Still processing"/);
    expect(page).toMatch(/processed: "Refunded"/);
    expect(page).toMatch(/REFUND_STATUS_WORD\[r\.status\] \?\? r\.status/);
    expect(page).toMatch(/REFUND_STATUS_WORD\[f\] \?\? f/);
  });
});
