import { describe, it, expect } from "@jest/globals";
import { validateName, normalizeName, isValidName, getNameError } from "@/lib/name-validation";

describe("Name Validation", () => {
  describe("validateName", () => {
    it("should accept simple English names", () => {
      expect(validateName("Kalyan")).toEqual(expect.objectContaining({ valid: true }));
      expect(validateName("Poguru")).toEqual(expect.objectContaining({ valid: true }));
      expect(validateName("John")).toEqual(expect.objectContaining({ valid: true }));
      expect(validateName("Sarah")).toEqual(expect.objectContaining({ valid: true }));
    });

    it("should accept names with hyphens", () => {
      expect(validateName("Anne-Marie")).toEqual(expect.objectContaining({ valid: true }));
      expect(validateName("Jean-Paul")).toEqual(expect.objectContaining({ valid: true }));
    });

    it("should accept names with apostrophes", () => {
      expect(validateName("O'Connor")).toEqual(expect.objectContaining({ valid: true }));
      expect(validateName("O'Brien")).toEqual(expect.objectContaining({ valid: true }));
    });

    it("should accept names with spaces", () => {
      expect(validateName("Mary Jane")).toEqual(expect.objectContaining({ valid: true }));
      expect(validateName("John Paul")).toEqual(expect.objectContaining({ valid: true }));
    });

    it("should accept Unicode letters (accented characters)", () => {
      expect(validateName("François")).toEqual(expect.objectContaining({ valid: true }));
      expect(validateName("José")).toEqual(expect.objectContaining({ valid: true }));
      expect(validateName("Müller")).toEqual(expect.objectContaining({ valid: true }));
      expect(validateName("Åsa")).toEqual(expect.objectContaining({ valid: true }));
    });

    it("should accept Indian language names", () => {
      // Hindi
      expect(validateName("कलयाण")).toEqual(expect.objectContaining({ valid: true }));
      // Telugu
      expect(validateName("కల్యాణ")).toEqual(expect.objectContaining({ valid: true }));
      // Tamil
      expect(validateName("கல்யாணம்")).toEqual(expect.objectContaining({ valid: true }));
      // Kannada
      expect(validateName("ಕಲ್ಯಾಣ")).toEqual(expect.objectContaining({ valid: true }));
    });

    it("should reject empty or whitespace-only names", () => {
      expect(validateName("")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("   ")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName(null)).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName(undefined)).toEqual(expect.objectContaining({ valid: false }));
    });

    it("should reject names with numbers", () => {
      expect(validateName("John123")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("123John")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("J0hn")).toEqual(expect.objectContaining({ valid: false }));
    });

    it("should reject names with special characters", () => {
      expect(validateName("&({₹5:.&")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("66:&'&9'xavk")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("John@Doe")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("John#Doe")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("John$Doe")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("John%Doe")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("John*Doe")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("John{Doe}")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("John=Doe")).toEqual(expect.objectContaining({ valid: false }));
    });

    it("should reject names with emojis", () => {
      expect(validateName("John 😀")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("😀 John")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("John😀Doe")).toEqual(expect.objectContaining({ valid: false }));
    });

    it("should reject names with script markup", () => {
      expect(validateName("<script>alert('xss')</script>")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("John<script>")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("<img src=x>")).toEqual(expect.objectContaining({ valid: false }));
    });

    it("should reject names with only symbols", () => {
      expect(validateName("@#$%")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("---")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("'''")).toEqual(expect.objectContaining({ valid: false }));
    });

    it("should reject names starting/ending with hyphens or apostrophes", () => {
      expect(validateName("-John")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("John-")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("'John")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("John'")).toEqual(expect.objectContaining({ valid: false }));
    });

    it("should reject names with excessive hyphens or apostrophes", () => {
      expect(validateName("John---Doe")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("John'''Doe")).toEqual(expect.objectContaining({ valid: false }));
    });

    it("should reject names with consecutive spaces", () => {
      expect(validateName("John  Doe")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("John   Doe")).toEqual(expect.objectContaining({ valid: false }));
    });

    it("should reject names that are too long", () => {
      const tooLong = "A".repeat(101);
      expect(validateName(tooLong)).toEqual(expect.objectContaining({ valid: false }));
    });

    it("should reject names with currency symbols", () => {
      expect(validateName("₹ Rupee")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("$100 Dollar")).toEqual(expect.objectContaining({ valid: false }));
      expect(validateName("€ Euro")).toEqual(expect.objectContaining({ valid: false }));
    });

    it("should trim input before validation", () => {
      expect(validateName("  John  ")).toEqual(expect.objectContaining({ valid: true }));
      expect(validateName("\tJohn\t")).toEqual(expect.objectContaining({ valid: true }));
      expect(validateName("\nJohn\n")).toEqual(expect.objectContaining({ valid: true }));
    });
  });

  describe("normalizeName", () => {
    it("should trim whitespace", () => {
      expect(normalizeName("  John  ")).toBe("John");
      expect(normalizeName("\tJohn\t")).toBe("John");
    });

    it("should normalize consecutive spaces to single space", () => {
      expect(normalizeName("John  Doe")).toBe("John Doe");
      expect(normalizeName("John   Doe")).toBe("John Doe");
    });

    it("should preserve hyphens and apostrophes", () => {
      expect(normalizeName("Anne-Marie")).toBe("Anne-Marie");
      expect(normalizeName("O'Connor")).toBe("O'Connor");
    });

    it("should handle null and undefined", () => {
      expect(normalizeName(null)).toBe("");
      expect(normalizeName(undefined)).toBe("");
    });

    it("should handle empty string", () => {
      expect(normalizeName("")).toBe("");
    });
  });

  describe("isValidName", () => {
    it("should return true for valid names", () => {
      expect(isValidName("John")).toBe(true);
      expect(isValidName("Anne-Marie")).toBe(true);
      expect(isValidName("O'Connor")).toBe(true);
    });

    it("should return false for invalid names", () => {
      expect(isValidName("John123")).toBe(false);
      expect(isValidName("&({₹5:.&")).toBe(false);
      expect(isValidName("")).toBe(false);
    });

    it("should normalize before validation", () => {
      expect(isValidName("  John  ")).toBe(true);
      expect(isValidName("John  Doe")).toBe(true); // normalized to "John Doe"
    });
  });

  describe("getNameError", () => {
    it("should return empty string for valid names", () => {
      expect(getNameError("John")).toBe("");
      expect(getNameError("Anne-Marie")).toBe("");
    });

    it("should return error message for invalid names", () => {
      const error1 = getNameError("John123");
      expect(error1.length).toBeGreaterThan(0);
      expect(error1).not.toMatch(/^$/);

      const error2 = getNameError("");
      expect(error2.length).toBeGreaterThan(0);

      const error3 = getNameError("&({₹5:.&");
      expect(error3.length).toBeGreaterThan(0);
    });
  });
});
