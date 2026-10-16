/**
 * The Participants page uses plain words for statuses, types and actions.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/participants/page.tsx"), "utf8");

describe("Participants page wording", () => {
  it("shows ID status and participant type in plain words", () => {
    expect(page).toMatch(/ID_STATUS_LABEL\[p\.verification_status\]/);
    expect(page).toMatch(/TYPE_LABEL\[p\.participant_type\]/);
    expect(page).toMatch(/need_clarification: "Needs correction"/);
  });

  it("the edit action and the empty state say what they do", () => {
    expect(page).toMatch(/Edit details/);
    expect(page).toMatch(/Clear the search or filters to see everyone/);
  });

  it("the filter values still match the API statuses", () => {
    expect(page).toMatch(/<option value="need_clarification">Needs correction<\/option>/);
    expect(page).toMatch(/<option value="pending">Awaiting review<\/option>/);
  });
});
