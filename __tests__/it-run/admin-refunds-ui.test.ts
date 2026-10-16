/**
 * Refund Requests shows plain status words on each card and in the summary.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/refund-requests/page.tsx"), "utf8");

describe("Refund Requests page wording", () => {
  it("each request shows its status in words, not the raw code", () => {
    expect(page).toMatch(/STATUS_WORD\[item\.status\] \?\? item\.status/);
    expect(page).toMatch(/executed: "Refund issued"/);
  });

  it("the summary and the filter use the same names", () => {
    expect(page).toMatch(/label: "Awaiting review", value: summary\?\.pendingReview/);
    expect(page).toMatch(/\{ value: "executed", label: "Refund issued" \}/);
  });

  it("the approve-first rule is stated on the page", () => {
    expect(page).toMatch(/Approving a request moves no money/);
  });
});
