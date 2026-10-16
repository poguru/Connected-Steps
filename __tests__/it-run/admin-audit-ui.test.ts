/**
 * Audit log page: plain heading and filters, and action labels in words. The stored action codes are unchanged.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/audit-logs/page.tsx"), "utf8");

describe("Audit log page wording", () => {
  it("the heading and filters are plain", () => {
    expect(page).toMatch(/>Audit log<\/h1>/);
    expect(page).toMatch(/Who did it \(email\)/);
    expect(page).toMatch(/Show results/);
  });

  it("the action labels use the same words as the rest of the portal", () => {
    expect(page).toMatch(/label: "BIB handed out"/);
    expect(page).toMatch(/label: "T-shirt handed out"/);
    expect(page).toMatch(/label: "Asked for correction"/);
  });

  it("the stored action codes are unchanged", () => {
    expect(page).toMatch(/bib_collected:\s+\{/);
    expect(page).toMatch(/tshirt_issued:\s+\{/);
    expect(page).toMatch(/verification_need_clarification:/);
  });
});
