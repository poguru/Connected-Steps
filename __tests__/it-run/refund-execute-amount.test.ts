/**
 * Issuing an approved category-cancel refund must send the approved amount. Sending the whole remaining amount makes
 * the executor refuse the request ("uses the amount in the approved request"), so the admin page must fix the amount
 * for category-cancel requests as it does for ID-failure requests.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/refund-requests/page.tsx"), "utf8");

describe("refund request page: amount to issue", () => {
  it("uses the approved amount for category-cancel requests", () => {
    expect(page).toMatch(/item\.request_kind === "id_failure" \|\| item\.request_kind === "category_cancel"/);
  });

  it("the executor still refuses a different amount for these requests", () => {
    const route = fs.readFileSync(path.resolve(__dirname, "../../app/api/it-run/admin/refund/route.ts"), "utf8");
    expect(route).toMatch(/request_kind === "id_failure" \|\| request\.request_kind === "category_cancel"/);
    expect(route).toMatch(/An ID-failure refund uses the amount in the approved request/);
  });
});
