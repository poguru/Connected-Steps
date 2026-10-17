/**
 * The Race Day Information field is removed from the admin settings, along with the landing section that used it.
 */

import fs from "fs";
import path from "path";

const settings = fs.readFileSync(path.resolve(__dirname, "../../app/it-run/admin/settings/page.tsx"), "utf8");

describe("Race Day Information is removed", () => {
  it("the admin settings page no longer offers the field", () => {
    expect(settings).not.toMatch(/Race Day Information/);
    expect(settings).not.toMatch(/name="race_day_info"/);
  });

  it("the BIB collection details are still editable", () => {
    expect(settings).toMatch(/name="bib_collection_info"/);
  });
});
