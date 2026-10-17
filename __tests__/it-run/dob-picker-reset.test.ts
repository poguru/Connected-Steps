/**
 * The participant form is keyed by the participant, so the date picker starts fresh for each person. Without the key, the
 * previous person's partial date stayed on screen while the stored date was empty.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/register/page.tsx"), "utf8");

describe("date of birth picker is reset per participant", () => {
  it("the participant form is keyed by the participant position", () => {
    expect(page).toMatch(/<ParticipantForm\s*\n\s*key=\{participantSubIdx\}/);
  });
});
