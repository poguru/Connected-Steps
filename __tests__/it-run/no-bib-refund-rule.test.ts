/**
 * The no-BIB refund share depends on the date: 90% before registration closes, 50% after. The email states the share.
 */

import fs from "fs";
import path from "path";
import { noBibRefundPercent } from "@/lib/it-run-bib-desk";
import { buildNoBibCancellationEmail } from "@/lib/it-run-category-cancel-email";

const ROOT = path.resolve(__dirname, "../..");
const CLOSES = "2027-01-15T18:29:59Z";

describe("noBibRefundPercent", () => {
  it("is 90% before registration closes", () => {
    expect(noBibRefundPercent(CLOSES, new Date("2027-01-10T00:00:00Z"))).toBe(90);
  });

  it("is 50% once registration has closed", () => {
    expect(noBibRefundPercent(CLOSES, new Date("2027-01-16T00:00:00Z"))).toBe(50);
  });

  it("is 50% at the exact closing moment", () => {
    expect(noBibRefundPercent(CLOSES, new Date(CLOSES))).toBe(50);
  });

  it("is 90% when no closing time is recorded, or it cannot be read", () => {
    expect(noBibRefundPercent(null, new Date("2027-06-01T00:00:00Z"))).toBe(90);
    expect(noBibRefundPercent("not a date", new Date("2027-06-01T00:00:00Z"))).toBe(90);
  });
});

describe("buildNoBibCancellationEmail", () => {
  const base = { firstName: "Asha", eventTitle: "The IT Run Sprint-2", categoryName: "5K Timed", refundPaise: 49950, refundPercent: 50, free: false };

  it("states the refund amount, the share, and the deduction", () => {
    const html = buildNoBibCancellationEmail(base);
    expect(html).toContain("Rs. 499.5");
    expect(html).toContain("50% of the category price");
    expect(html).toContain("50% deduction");
  });

  it("states the 90% share when that applies", () => {
    const html = buildNoBibCancellationEmail({ ...base, refundPaise: 89910, refundPercent: 90 });
    expect(html).toContain("90% of the category price");
    expect(html).toContain("10% deduction");
  });

  it("a free registration says no payment was taken, and states no amount", () => {
    const html = buildNoBibCancellationEmail({ ...base, refundPaise: 0, free: true });
    expect(html).toContain("no payment was taken");
    expect(html).not.toContain("Rs. ");
  });

  it("the route uses the date rule and sends the email", () => {
    const route = fs.readFileSync(path.join(ROOT, "app/api/it-run/admin/bib-desk/no-bib-cancel/route.ts"), "utf8");
    expect(route).toMatch(/noBibRefundPercent\(/);
    expect(route).toMatch(/buildNoBibCancellationEmail/);
  });
});
