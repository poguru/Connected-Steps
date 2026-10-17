/**
 * The My Registrations page offers the IT Run to signed-in accounts that have no IT Run registration yet.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/my-events/page.tsx"), "utf8");

describe("My Registrations: the flagship event", () => {
  it("shows the offer only when the account has no IT Run registration", () => {
    expect(page).toMatch(/!events\.some\(e => e\.type === "it-run"\)/);
  });

  it("shows the offer under All and Upcoming, linking to the canonical route", () => {
    expect(page).toMatch(/filter === "all" \|\| filter === "upcoming"/);
    expect(page).toMatch(/href=\{FEATURED_EVENT\.href\}/);
  });
});
