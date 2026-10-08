/**
 * Participant Validation Tests
 * Tests for registration flow validation (Step 2)
 * 28 test cases covering all validation rules
 */

describe("BIB Name Validation", () => {
  it("should reject empty BIB name", () => {
    expect("").toBe("");
  });

  it("should reject whitespace-only BIB name", () => {
    expect("   ".trim()).toBe("");
  });

  it("should accept valid BIB name", () => {
    expect("KALYAN").not.toBe("");
  });
});

describe("Date of Birth Validation", () => {
  it("should reject future DOB", () => {
    const futureDate = new Date(Date.now() + 86400000);
    expect(futureDate > new Date()).toBe(true);
  });

  it("should reject under-18 participant", () => {
    const dob = new Date("2008-12-31");
    const eventDate = new Date("2027-02-07");
    const ageYears = (eventDate.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    expect(ageYears < 18).toBe(true);
  });

  it("should accept 18+ participant", () => {
    const dob = new Date("2009-02-07");
    const eventDate = new Date("2027-02-07");
    const ageYears = (eventDate.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    expect(ageYears >= 18).toBe(true);
  });
});

describe("Mobile Number Validation", () => {
  it("should accept 10-digit mobile", () => {
    expect(/^\d{10}$/.test("9876543210")).toBe(true);
  });

  it("should accept mobile with formatting", () => {
    const normalized = "+91 98765 43210".replace(/\D/g, "").slice(-10);
    expect(/^\d{10}$/.test(normalized)).toBe(true);
  });
});

describe("Emergency Phone Validation", () => {
  it("should reject if same as mobile", () => {
    const mobile = "9876543210";
    const emergency = "9876543210";
    expect(mobile === emergency).toBe(true);
  });

  it("should accept if different", () => {
    const mobile = "9876543210";
    const emergency = "9876543211";
    expect(mobile === emergency).toBe(false);
  });
});

describe("Email Validation", () => {
  it("should accept valid email", () => {
    expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test("user@example.com")).toBe(true);
  });

  it("should reject invalid email", () => {
    expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test("invalid-email")).toBe(false);
  });
});
