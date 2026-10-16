/**
 * Confirmation emails page: plain words, and the BIB instruction matches the real process.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/notifications/page.tsx"), "utf8");

describe("Confirmation emails page", () => {
  it("the title and filters are plain", () => {
    expect(page).toMatch(/>Confirmation emails<\/h1>/);
    expect(page).toMatch(/\["sent","Confirmation sent"\]/);
    expect(page).toMatch(/\["unsent","Confirmation not sent"\]/);
  });

  it("the BIB instruction matches the process: numbers first, no 2-day slot-link email", () => {
    expect(page).toMatch(/Allocate the numbers first on the BIB Numbers page/);
    expect(page).not.toMatch(/2 days before the event/);
    expect(page).not.toMatch(/slot-booking links to all confirmed/);
  });

  it("resend prompts say what they do", () => {
    expect(page).toMatch(/Send the confirmation email again to/);
  });
});
