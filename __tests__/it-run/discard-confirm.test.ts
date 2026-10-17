/**
 * "Start New Registration" removes the saved registration. It needs a second, explicit tap on the page that says how
 * many runners will be deleted. The browser confirm() dialog is not used, because some phone browsers suppress it.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/register/page.tsx"), "utf8");

describe("discarding a saved registration", () => {
  it("first asks on the page, and only the confirm button calls discardDraft", () => {
    expect(page).toMatch(/onClick=\{\(\) => setConfirmingDiscard\(true\)\}/);
    expect(page).toMatch(/onClick=\{\(\) => \{ setConfirmingDiscard\(false\); discardDraft\(\); \}\}/);
  });

  it("says how many runners will be deleted", () => {
    expect(page).toMatch(/This deletes the saved details for \{runners\} runner/);
  });

  it("the browser confirm() dialog is no longer used for this", () => {
    expect(page).not.toMatch(/confirm\("Start a new registration\?/);
  });
});
