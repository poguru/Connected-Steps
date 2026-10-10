/**
 * The kind of ID is recorded with the document, and the approval email says which kind was approved.
 * A government ID is never described as a company ID.
 */

import { idDocumentTypeFor } from "@/lib/it-run-id-verification";
import { buildCompanyVerificationApprovedEmail } from "@/lib/it-run-verification";

const DOC = "1790000000000-abc123.pdf";
const EVENT = { eventTitle: "The IT Run Sprint-2", eventDate: "February 7, 2027" };

describe("idDocumentTypeFor", () => {
  it("records no type when no document was uploaded (Continue Without ID)", () => {
    expect(idDocumentTypeFor(null, "government")).toBeNull();
    expect(idDocumentTypeFor("", "company")).toBeNull();
  });

  it("defaults an uploaded document to company ID", () => {
    expect(idDocumentTypeFor(DOC, undefined)).toBe("company");
    expect(idDocumentTypeFor(DOC, "company")).toBe("company");
  });

  it("records a government ID when the participant chose it", () => {
    expect(idDocumentTypeFor(DOC, "government")).toBe("government");
  });

  it("ignores any other value sent by the client", () => {
    expect(idDocumentTypeFor(DOC, "passport-admin-override")).toBe("company");
  });
});

describe("approval emails", () => {
  it("a company ID approval says company ID verified", () => {
    const html = buildCompanyVerificationApprovedEmail("Asha", EVENT, "company");
    expect(html).toContain("Company ID Verified");
    expect(html).toContain("Your company ID has been verified");
    expect(html).not.toContain("government-issued");
  });

  it("a government ID approval is not described as company ID verification", () => {
    const html = buildCompanyVerificationApprovedEmail("Asha", EVENT, "government");
    expect(html).toContain("government-issued ID was reviewed");
    expect(html).toContain("This is not company ID verification");
    expect(html).not.toContain("Your company ID has been verified");
  });

  it("the default (no type given) is the company ID wording", () => {
    expect(buildCompanyVerificationApprovedEmail("Asha", EVENT)).toContain("Your company ID has been verified");
  });
});
