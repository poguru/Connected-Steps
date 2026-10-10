/**
 * The ID line in the registration email. Registration confirmation and ID review are separate: every note says the
 * registration is confirmed, and a government ID is never described as a company ID.
 */

import { idStatusNote } from "@/lib/it-run-email";

describe("idStatusNote", () => {
  it("a participant with no ID is told the registration is confirmed and how to add one later", () => {
    const n = idStatusNote("not_provided", null);
    expect(n).toMatch(/No ID uploaded/);
    expect(n).toMatch(/Your registration is confirmed/);
    expect(n).toMatch(/My Registrations/);
  });

  it("a company ID under review is named as a company ID", () => {
    const n = idStatusNote("pending", "company");
    expect(n).toMatch(/company ID/);
    expect(n).not.toMatch(/government/);
    expect(n).toMatch(/place is not affected/);
  });

  it("a government ID under review is named as a government ID, never a company ID", () => {
    const n = idStatusNote("pending", "government");
    expect(n).toMatch(/government-issued ID/);
    expect(n).not.toMatch(/company ID/);
  });

  it("a government ID approval is not described as company ID verification", () => {
    const n = idStatusNote("verified", "government");
    expect(n).toMatch(/government-issued ID has been reviewed/);
    expect(n).not.toMatch(/company ID/);
  });

  it("a company ID approval says company ID verified", () => {
    expect(idStatusNote("verified", "company")).toBe("Your company ID has been verified.");
  });

  it("a child (verified with no document) has nothing to say about an ID", () => {
    expect(idStatusNote(null, null)).toBe("");
  });
});
