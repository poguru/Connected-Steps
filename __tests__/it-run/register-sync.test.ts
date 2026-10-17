/**
 * Registration sync between the browser and the server, on every phone:
 *  - the BIB Name field stores what is typed (no rewrite on each keystroke, which breaks Android keyboards);
 *  - a newer browser copy is not replaced by an older server copy on resume, and is shown as unsaved until saved;
 *  - a browser-only draft is never shown as saved.
 *
 * Source-level checks, like the other register tests: the page is a client component with no test renderer here.
 */

import fs from "fs";
import path from "path";
import { checkBibName } from "@/lib/it-run-name-validation";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/register/page.tsx"), "utf8");
const route = fs.readFileSync(path.resolve(__dirname, "../../app/api/it-run/register/route.ts"), "utf8");

describe("BIB Name input", () => {
  it("does not rewrite the typed value on each change", () => {
    expect(page).toMatch(/onChange=\{e => onChange\("bibName", e\.target\.value\)\}/);
    expect(page).not.toMatch(/onChange\("bibName", e\.target\.value\.toUpperCase\(\)\)/);
  });

  it("shows capitals with CSS, so the display matches what is saved", () => {
    expect(page).toMatch(/textTransform: "uppercase"/);
  });

  it("the server still stores BIB names in capitals", () => {
    expect(route).toMatch(/bib_name:\s+normalizeName\(p\.bibName\)\.toUpperCase\(\)/);
  });

  it("lower-case names are accepted by the validation", () => {
    expect(checkBibName("pavan kumar").ok).toBe(true);
    expect(checkBibName("p-kalyan").ok).toBe(true);
  });
});

describe("saving when the page is hidden", () => {
  it("listens for the page being hidden and shown again", () => {
    expect(page).toMatch(/document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
    expect(page).toMatch(/document\.visibilityState === "hidden"/);
  });

  it("sends the unsent details with keepalive, using the current server version", () => {
    expect(page).toMatch(/keepalive: true/);
    expect(page).toMatch(/expectedVersion = now\.serverDraft\.version;/);
    expect(page).toMatch(/if \(key === now\.savedKey\) return;/);
  });

  it("confirms a background save only when the version moved by exactly one", () => {
    expect(page).toMatch(/d\.version === expectedVersion \+ 1/);
    expect(page).toMatch(/if \(d\.version === pending\.version\)/);
  });

  it("asks the server for the version when the page is shown again", () => {
    expect(page).toMatch(/fetch\(`\/api\/it-run\/drafts\?t=\$\{encodeURIComponent\(pending\.token\)\}`/);
  });
});

describe("resume: the newer copy wins, and is shown as unsaved until saved", () => {
  it("compares the browser copy's save time with the server copy's", () => {
    expect(page).toMatch(/local\.savedAt > serverSavedMs/);
  });

  it("only uses the browser copy when it is the same draft and the same category", () => {
    expect(page).toMatch(/localStorage\.getItem\(DRAFT_TOKEN_KEY\) === found\.token/);
    expect(page).toMatch(/local\.selectedCatId === d\.selectedCatId/);
  });

  it("keeps the server version, so the next save sends the newer details", () => {
    expect(page).toMatch(/setServerDraft\(\{ token: found\.token, version: found\.version, savedAt: serverSavedMs \}\)/);
  });

  it("flags a newer browser copy as unsaved", () => {
    expect(page).toMatch(/unsavedLocal: newerLocal !== null/);
  });

  it("a browser-only draft (no server copy) is flagged as unsaved too", () => {
    expect(page).toMatch(/setDraftToResume\(\{ \.\.\.d, unsavedLocal: true \}\)/);
  });
});
