/**
 * Every route that hands out a BIB applies the same readiness rule as the BIB desk, so the company-ID policy cannot be
 * bypassed through another screen.
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("BIB issuance is gated on the same readiness rule on every route", () => {
  it("the BIB desk route", () => {
    expect(read("app/api/it-run/bib-collection/route.ts")).toMatch(/collectionReadiness\(\{/);
  });

  it("the admin BIB-collect route refuses anything that is not ready", () => {
    const src = read("app/api/it-run/admin/bib-collect/route.ts");
    expect(src).toMatch(/collectionReadiness\(\{/);
    expect(src).toMatch(/if \(readiness\.state !== "ready"\)/);
  });

  it("the staff entitlement route refuses a BIB that is not ready", () => {
    const src = read("app/api/it-run/staff/entitlements/issue/route.ts");
    expect(src).toMatch(/if \(entitlementType === "BIB"\)/);
    expect(src).toMatch(/if \(readiness\.state !== "ready"\)/);
  });
});
