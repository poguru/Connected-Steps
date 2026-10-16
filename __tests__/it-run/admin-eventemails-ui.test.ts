/**
 * Event emails page: plain tab names, what the page does, and retry wording.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/emails/page.tsx"), "utf8");

describe("Event emails page wording", () => {
  it("explains what the page does, and that a preview comes first", () => {
    expect(page).toMatch(/You check the list of people and see a preview first/);
  });

  it("tabs and labels are plain", () => {
    expect(page).toMatch(/"Send an update"/);
    expect(page).toMatch(/"Resend a confirmation"/);
    expect(page).toMatch(/Who should receive it/);
    expect(page).toMatch(/Past sends/);
  });

  it("the send choices still match the API values", () => {
    expect(page).toMatch(/value: "both"|<option value="both">/);
    expect(page).toMatch(/destination/);
  });
});
