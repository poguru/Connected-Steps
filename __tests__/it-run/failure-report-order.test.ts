/**
 * A failed request is reported with its real status. The status is reported before the response body is read, so a
 * non-JSON error (for example a plain-text 413 for an oversized upload) is not mislabelled as "no response".
 */

import fs from "fs";
import path from "path";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

const ENDPOINTS = [
  "/api/auth/send-otp",
  "/api/auth/complete-event-verify",
  "/api/it-run/upload/company-id",
  "/api/it-run/coupons/validate",
  "/api/it-run/register",
  "/api/it-run/payment/create-order",
  "/api/it-run/payment/verify",
];

describe("the registration page reports the real status", () => {
  const page = read("app/it-run/register/page.tsx");

  it.each(ENDPOINTS)("%s is reported before its body is read", endpoint => {
    const escaped = endpoint.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    expect(page).toMatch(new RegExp(`if \\(!res\\.ok\\) reportFailure\\("${escaped}", res\\.status\\);\\s*const \\w+ = await res\\.json\\(\\);`));
  });

  it("the upload reports its status before reading the body", () => {
    expect(page).toMatch(/if \(!res\.ok\) reportFailure\("\/api\/it-run\/upload\/company-id", res\.status\);\s*const data = await res\.json\(\);/);
  });
});
