/**
 * UI-to-API integration fixes: the staff check-in posts to a route that handles POST, and the participants list can
 * filter for runners with an alternative address.
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("staff check-in posts to the route that handles it", () => {
  it("the page posts to /api/it-run/checkin, which exports POST", () => {
    const page = read("app/it-run/staff/checkin/page.tsx");
    expect(page).toMatch(/fetch\("\/api\/it-run\/checkin", \{\s*method: "POST"/);
    expect(page).not.toMatch(/fetch\("\/api\/it-run\/admin\/checkins", \{\s*method: "POST"/);
    expect(read("app/api/it-run/checkin/route.ts")).toMatch(/export async function POST/);
  });
});

describe("participants list can filter for an alternative email", () => {
  it("the API applies the filter only when asked", () => {
    const route = read("app/api/it-run/admin/participants/route.ts");
    expect(route).toMatch(/if \(alt === "yes"\) query = query\.not\("alt_email", "is", null\)/);
  });

  it("the page offers the filter and sends it", () => {
    const page = read("app/it-run/admin/participants/page.tsx");
    expect(page).toMatch(/Has alternative email/);
    expect(page).toMatch(/params\.set\("alt", "yes"\)/);
  });
});
