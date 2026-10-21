/**
 * The event is spelled "Sprint" everywhere the app shows it. A misspelling in the source must fail here.
 */

import fs from "fs";
import path from "path";

const ROOTS = ["app", "lib", "components"];

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(tsx?|jsx?|css)$/.test(e.name) ? [p] : [];
  });
}

describe("the event name", () => {
  const sources = ROOTS.flatMap(r => files(path.resolve(__dirname, "../..", r)));

  it("is never misspelt as Sprit or Spirit in the app", () => {
    const bad = sources.filter(f => /\b(sprit|spirit)-?2\b/i.test(fs.readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });

  it("the registration header uses the correct spelling", () => {
    const register = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/register/page.tsx"), "utf8");
    expect(register).toMatch(/>SPRINT-2</);
  });
});
