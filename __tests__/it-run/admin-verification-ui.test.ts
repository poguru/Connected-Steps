/**
 * The Company ID Checks page says what each action does, in plain words.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/verification/page.tsx"), "utf8");

describe("Company ID Checks page wording", () => {
  it("the actions say what they do", () => {
    expect(page).toMatch(/"Verify ID"/);
    expect(page).toMatch(/"Reject ID"/);
    expect(page).toMatch(/"Ask for correction"/);
    expect(page).toMatch(/"Company ID verified"/);
  });

  it("the page explains how to use it and what each action changes", () => {
    expect(page).toMatch(/How to use:/);
    expect(page).toMatch(/Ask for correction keeps the registration and cancels nothing/);
  });

  it("the count reads as people in the list", () => {
    expect(page).toMatch(/in this list/);
  });
});
