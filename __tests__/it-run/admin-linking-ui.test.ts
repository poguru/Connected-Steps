/**
 * Link accounts page: plain words that say what connecting a registration does.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/user-linking/page.tsx"), "utf8");

describe("Link accounts page wording", () => {
  it("explains the purpose without the technical field name", () => {
    expect(page).toMatch(/Connect registrations to accounts/);
    expect(page).toMatch(/so the runner may not see them when signed in/);
    expect(page).not.toMatch(/linked_user_email\)/);
  });

  it("the actions and lists are plain", () => {
    expect(page).toMatch(/Not yet connected \(/);
    expect(page).toMatch(/"Connect"/);
    expect(page).toMatch(/Connect this registration/);
  });
});
