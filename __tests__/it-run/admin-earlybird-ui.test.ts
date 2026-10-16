/**
 * Early Bird page: each offer's live state is shown in words.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/early-bird/page.tsx"), "utf8");

describe("Early Bird page wording", () => {
  it("each offer's live state is shown in words", () => {
    expect(page).toMatch(/sold_out: "All places taken"/);
    expect(page).toMatch(/running: "Running now"/);
    expect(page).toMatch(/LIVE_WORD\[o\.live_state\] \?\?/);
  });

  it("the minimum-payable field says what it means", () => {
    expect(page).toMatch(/Customer must still pay at least/);
  });
});
