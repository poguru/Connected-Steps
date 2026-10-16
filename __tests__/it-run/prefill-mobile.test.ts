/**
 * A mobile saved in the profile is prefilled without a trunk 0 or a +91 prefix. A number that is still not 10 digits
 * is left empty for the participant to type.
 */

import { prefillIndianMobile, normalizeIndianPhone } from "@/lib/it-run-validation";

describe("prefillIndianMobile", () => {
  it("drops a trunk 0 from an 11-digit number", () => {
    expect(prefillIndianMobile("09876543210")).toBe("9876543210");
  });

  it("drops the +91 prefix", () => {
    expect(prefillIndianMobile("+91 98765 43210")).toBe("9876543210");
    expect(prefillIndianMobile("919876543210")).toBe("9876543210");
  });

  it("keeps a valid 10-digit number unchanged", () => {
    expect(prefillIndianMobile("9876543210")).toBe("9876543210");
  });

  it("leaves a 10-digit number that starts with 0 empty: it cannot become a valid number", () => {
    expect(prefillIndianMobile("0970362057")).toBe("");
  });

  it("leaves a missing or short value empty", () => {
    expect(prefillIndianMobile(undefined)).toBe("");
    expect(prefillIndianMobile("98765")).toBe("");
    expect(prefillIndianMobile("")).toBe("");
  });

  it("the validator rejects a 10-digit number that starts with 0 or a digit below 6", () => {
    expect(normalizeIndianPhone("0970362057")).toBeNull();
    expect(normalizeIndianPhone("5876543210")).toBeNull();
    expect(normalizeIndianPhone("9876543210")).toBe("9876543210");
  });

  it("everything it fills in is accepted by the validator", () => {
    for (const raw of ["09876543210", "+91 98765 43210", "9876543210"]) {
      const filled = prefillIndianMobile(raw);
      expect(normalizeIndianPhone(filled)).toBe(filled);
    }
  });
});
