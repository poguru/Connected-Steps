/**
 * Landing page: the official transparent logo is referenced, stale August 2026 dates are gone,
 * and participants can reach their registrations from the page.
 */
import fs from "fs";
import path from "path";

const ROOT = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("landing page logo", () => {
  it("uses the transparent PNG that exists in the project", () => {
    const logo = path.join(ROOT, "public/events/it-run-sprint-2/IT Run Sprint-2 Logo.png");
    expect(fs.existsSync(logo)).toBe(true);
  });

  it("no source file still references the missing JPEG", () => {
    for (const rel of ["app/it-run/page.tsx", "app/it-run/components/EventBranding.tsx", "app/it-run/register/page.tsx"]) {
      expect(read(rel)).not.toMatch(/Logo\.jpeg/);
    }
  });
});

describe("event dates", () => {
  it("the public page no longer shows August 2026 dates", () => {
    expect(read("app/it-run/page.tsx")).not.toMatch(/August \d+, 2026/);
    expect(read("app/it-run/layout.tsx")).not.toMatch(/Aug(ust)? 17, 2026/);
  });
});

describe("registration access from the landing page", () => {
  it("links to My Registrations from the nav and the hero", () => {
    const page = read("app/it-run/page.tsx");
    expect((page.match(/href="\/it-run\/my-registrations"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(page).toMatch(/Sign in to view or manage your registration/);
  });
});
