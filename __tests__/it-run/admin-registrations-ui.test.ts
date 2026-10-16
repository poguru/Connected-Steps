/**
 * The Registrations page explains a booking and uses plain words for filters and ID status.
 */

import fs from "fs";
import path from "path";

const page = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/registrations/page.tsx"), "utf8");

describe("Registrations page wording", () => {
  it("explains what a registration is", () => {
    expect(page).toMatch(/A registration is one booking, which can cover several runners/);
  });

  it("filters use plain words and keep the API values", () => {
    expect(page).toMatch(/<option value="">Any payment<\/option>/);
    expect(page).toMatch(/<option value="active">Confirmed<\/option>/);
    expect(page).toMatch(/<option value="need_clarification">Needs correction<\/option>/);
    expect(page).toMatch(/<option value="pending_verification">Awaiting ID verification<\/option>/);
  });

  it("the ID status on each row is shown in words", () => {
    expect(page).toMatch(/ID_STATUS_WORDS\[p\.verification_status\]/);
  });
});
