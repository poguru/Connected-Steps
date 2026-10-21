/**
 * Where admin-created registrations show up: the registrations list labels them, and the monitoring summary counts
 * them apart from the public funnel.
 */

import fs from "fs";
import path from "path";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

describe("the registrations list", () => {
  it("reads the source and the waiver from each registration", () => {
    const route = read("app/api/it-run/admin/registrations/route.ts");
    expect(route).toMatch(/registration_source, created_by_admin, waiver_reason, waiver_approved_by/);
  });

  it("labels admin-created registrations, and complimentary ones separately", () => {
    const page = read("app/it-run/admin/registrations/page.tsx");
    expect(page).toMatch(/reg\.registration_source === "admin_manual"/);
    expect(page).toMatch(/admin · complimentary/);
    expect(page).toMatch(/admin-created/);
  });
});

describe("the monitoring summary", () => {
  it("counts admin-created and complimentary registrations from the registrations table", () => {
    const route = read("app/api/it-run/admin/monitoring/route.ts");
    expect(route).toMatch(/from\("it_run_registrations"\)[\s\S]*?eq\("registration_source", "admin_manual"\)/);
    expect(route).toMatch(/\.not\("waiver_approved_by", "is", null\)/);
    expect(route).toMatch(/manual: \{ created: manualCreated/);
  });

  it("the dashboard shows those counts apart from the public funnel", () => {
    const page = read("app/it-run/admin/monitoring/page.tsx");
    expect(page).toMatch(/Admin-created registrations/);
    expect(page).toMatch(/counted separately from the public registration funnel/);
  });
});
