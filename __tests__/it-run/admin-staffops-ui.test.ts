/**
 * The staff accounts page uses plain words for its title, form and role names.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/staff-ops/page.tsx"), "utf8");

describe("Staff accounts page wording", () => {
  it("title and form headings are plain", () => {
    expect(page).toMatch(/Race-day staff accounts/);
    expect(page).toMatch(/\+ Add a staff member/);
    expect(page).toMatch(/New staff member/);
  });

  it("role codes are shown as words, not upper-case codes", () => {
    expect(page).toMatch(/function roleLabel\(role: string\): string/);
    expect(page).not.toMatch(/\.replace\("_", " "\)\.toUpperCase\(\)/);
  });
});
