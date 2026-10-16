/**
 * The BIB Numbers page uses the approved no-BIB rule (not the old 80% route), and plain words.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/bibs/page.tsx"), "utf8");

describe("BIB Numbers page", () => {
  it("the no-BIB action uses the approved route, not the old 80% route", () => {
    expect(page).toMatch(/\/api\/it-run\/admin\/bib-desk\/no-bib-cancel/);
    expect(page).not.toMatch(/stage: "bib_collection"/);
    expect(page).not.toMatch(/80%/);
  });

  it("the no-BIB action is offered to any runner not yet collected", () => {
    expect(page).toMatch(/Cannot verify: go without BIB \(refund\)/);
  });

  it("the filters are in plain words", () => {
    expect(page).toMatch(/Everyone \(/);
    expect(page).toMatch(/No number yet \(/);
    expect(page).toMatch(/BIB collected \(/);
  });
});
