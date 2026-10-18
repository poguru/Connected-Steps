/**
 * On the review step, a long email must wrap inside its own cell, not run into the next field.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/register/page.tsx"), "utf8");

describe("review step: long values stay inside their cell", () => {
  it("each review cell can shrink to its column", () => {
    expect(page).toMatch(/\{fields\.filter\(\(\[, v\]\) => v\?\.trim\(\)\)\.map\(\(\[lbl, val\]\) => \(\s*<div key=\{lbl\} style=\{\{ minWidth: 0 \}\}>/);
  });

  it("long values such as email addresses wrap at any character", () => {
    expect(page).toMatch(/overflowWrap: "anywhere" as const \}\}>\{val\}/);
  });
});
