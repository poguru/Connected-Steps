/**
 * Identity-verification outcome: government and company are recorded separately, a rejection before close only asks for a
 * correct upload, a rejection after close cancels the category, and a review is refused when the record has changed.
 */

import fs from "fs";
import path from "path";
import { outcomeForDecision, storedStatusFor } from "@/lib/it-run-verification-outcome";

const ROOT = path.resolve(__dirname, "../..");

describe("outcomeForDecision", () => {
  it("an online Verified on a government ID is a government outcome", () => {
    expect(outcomeForDecision("verified", "government")).toBe("government_verified");
  });

  it("an online Verified on a company ID is a company outcome", () => {
    expect(outcomeForDecision("verified", "company")).toBe("company_verified");
  });

  it("Company ID Verified is the company outcome whatever document was supplied (manual desk)", () => {
    expect(outcomeForDecision("company_verified", "government")).toBe("company_verified");
    expect(outcomeForDecision("company_verified", null)).toBe("company_verified");
  });

  it("a government ID is never recorded as company proof by a plain Verified", () => {
    expect(outcomeForDecision("verified", "government")).not.toBe("company_verified");
  });

  it("rejection and clarification record no verification outcome", () => {
    expect(outcomeForDecision("rejected", "company")).toBeNull();
    expect(outcomeForDecision("need_clarification", "government")).toBeNull();
  });

  it("a missing document type never becomes an outcome from a plain Verified", () => {
    expect(outcomeForDecision("verified", null)).toBe("government_verified");
  });
});

describe("storedStatusFor", () => {
  it("stores Company ID Verified as verified, with the outcome beside it", () => {
    expect(storedStatusFor("company_verified")).toBe("verified");
  });

  it("stores the other decisions as they are", () => {
    expect(storedStatusFor("verified")).toBe("verified");
    expect(storedStatusFor("rejected")).toBe("rejected");
    expect(storedStatusFor("need_clarification")).toBe("need_clarification");
  });
});

describe("the admin verification route and page use the rules", () => {
  it("the route requires the record version, so a stale review is refused", () => {
    const route = fs.readFileSync(path.join(ROOT, "app/api/it-run/admin/verification/route.ts"), "utf8");
    expect(route).toMatch(/expectedVersion/);
    expect(route).toMatch(/\.eq\("verification_version", expectedVersion\)/);
    expect(route).toMatch(/VERSION_CONFLICT/);
  });

  it("a rejection cancels the runner's category, not the booking", () => {
    const route = fs.readFileSync(path.join(ROOT, "app/api/it-run/admin/verification/route.ts"), "utf8");
    expect(route).toMatch(/if \(action === "rejected"\) \{[\s\S]*?cancelRunnerCategory/);
    expect(route).not.toMatch(/rejectionCancelsCategory/);
  });

  it("the route accepts Company ID Verified and stores its outcome", () => {
    const route = fs.readFileSync(path.join(ROOT, "app/api/it-run/admin/verification/route.ts"), "utf8");
    expect(route).toMatch(/"company_verified"/);
    expect(route).toMatch(/verification_outcome: outcomeForDecision/);
  });

  it("the page sends the version and offers the Company ID Verified action", () => {
    const page = fs.readFileSync(path.join(ROOT, "app/it-run/admin/verification/page.tsx"), "utf8");
    expect(page).toMatch(/expectedVersion: data\.find/);
    expect(page).toMatch(/updateStatus\(p\.id, "company_verified"\)/);
  });

  it("a resubmitted document clears the outcome and is reviewed again", () => {
    const resubmit = fs.readFileSync(path.join(ROOT, "app/api/it-run/company-id/resubmit/route.ts"), "utf8");
    expect(resubmit).toMatch(/verification_outcome: null/);
    expect(resubmit).toMatch(/verification_status: "pending"/);
  });
});

describe("the admin queue filters", () => {
  it("filters by outcome and by the submitted document type, beside the status filter", () => {
    const route = fs.readFileSync(path.join(ROOT, "app/api/it-run/admin/verification/route.ts"), "utf8");
    expect(route).toMatch(/query\.eq\("verification_outcome", status\)/);
    expect(route).toMatch(/status === "company_submitted"/);
    expect(route).toMatch(/status === "government_submitted"/);
  });

  it("the page offers the outcome and submitted-document filters", () => {
    const page = fs.readFileSync(path.join(ROOT, "app/it-run/admin/verification/page.tsx"), "utf8");
    expect(page).toMatch(/value: "company_verified"/);
    expect(page).toMatch(/value: "government_submitted"/);
  });
});
