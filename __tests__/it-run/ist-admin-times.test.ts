/**
 * Times typed in the IT Run admin settings are Indian time. They must be stored with the IST offset, so 10:36 typed
 * means 10:36 IST, not 10:36 UTC.
 */

import fs from "fs";
import path from "path";
import { istLocalToInstant } from "@/lib/it-run-registration-window";

const route = fs.readFileSync(path.resolve(__dirname, "../../app/api/it-run/admin/event-settings/route.ts"), "utf8");

describe("istLocalToInstant", () => {
  it("adds the IST offset to a time typed without a zone", () => {
    expect(istLocalToInstant("2026-10-20T10:36")).toBe("2026-10-20T10:36:00+05:30");
    expect(istLocalToInstant("2027-01-31T23:59:30")).toBe("2027-01-31T23:59:30+05:30");
  });

  it("leaves a value that already has a zone unchanged", () => {
    expect(istLocalToInstant("2026-10-20T05:06:00Z")).toBe("2026-10-20T05:06:00Z");
    expect(istLocalToInstant("2026-10-20T10:36:00+05:30")).toBe("2026-10-20T10:36:00+05:30");
  });

  it("the 10:36 IST opening time is 05:06 UTC", () => {
    expect(Date.parse(istLocalToInstant("2026-10-20T10:36"))).toBe(Date.parse("2026-10-20T05:06:00Z"));
  });
});

describe("the settings route stores the admin's times as IST", () => {
  it("converts the opening and closing times before saving", () => {
    expect(route).toMatch(/IST_TIME_FIELDS = new Set\(\["registration_opens_at", "registration_closes_at"\]\)/);
    expect(route).toMatch(/istLocalToInstant\(editable\[k\] as string\)/);
  });
});
