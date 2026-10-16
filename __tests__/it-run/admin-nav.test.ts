/**
 * The admin menu: every admin page is reachable from it (except the login page), and every menu link points to a page
 * that exists.
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const ADMIN = path.join(ROOT, "app", "it-run", "admin");

/** The URL of every admin page, e.g. /it-run/admin/participants */
function adminPageUrls(): string[] {
  const urls: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
      } else if (name === "page.tsx") {
        const rel = path.relative(ADMIN, dir).split(path.sep).join("/");
        urls.push(rel ? "/it-run/admin/" + rel : "/it-run/admin");
      }
    }
  };
  walk(ADMIN);
  return urls;
}

const layout = fs.readFileSync(path.join(ADMIN, "layout.tsx"), "utf8");
const menuLinks = Array.from(layout.matchAll(/href: "(\/it-run\/admin[^"]*)"/g)).map(m => m[1]);

describe("the admin menu", () => {
  it("every admin page except login is in the menu", () => {
    const missing = adminPageUrls().filter(p => !p.endsWith("/login") && !menuLinks.includes(p));
    expect(missing).toEqual([]);
  });

  it("every menu link points to a page that exists", () => {
    const pages = new Set(adminPageUrls());
    const dangling = menuLinks.filter(l => !pages.has(l));
    expect(dangling).toEqual([]);
  });

  it("the menu is grouped into sections", () => {
    expect(layout).toMatch(/const SECTIONS = \[/);
    expect(layout).toMatch(/\{SECTIONS\.map\(section =>/);
  });
});
