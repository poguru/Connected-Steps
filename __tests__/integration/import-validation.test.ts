/**
 * Tests for CSV parsing and row validation.
 * Uses the shared lib/csv-utils.ts utilities directly.
 */

import { parseCsvSimple, splitCsvLine, validateImportRows } from "@/lib/csv-utils";

// ── splitCsvLine ──────────────────────────────────────────────────────────────

describe("splitCsvLine", () => {
  it("splits a simple comma-separated line", () => {
    expect(splitCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("handles quoted fields with commas", () => {
    expect(splitCsvLine('"last, first",email@test.com,role')).toEqual(["last, first", "email@test.com", "role"]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    expect(splitCsvLine('"say ""hello""",next')).toEqual(['say "hello"', "next"]);
  });

  it("handles empty fields", () => {
    expect(splitCsvLine("a,,c")).toEqual(["a", "", "c"]);
  });

  it("returns a single-element array for no commas", () => {
    expect(splitCsvLine("hello")).toEqual(["hello"]);
  });
});

// ── parseCsvSimple ────────────────────────────────────────────────────────────

describe("parseCsvSimple", () => {
  it("returns empty array for header-only CSV", () => {
    expect(parseCsvSimple("first_name,last_name,email")).toEqual([]);
  });

  it("parses a simple two-row CSV", () => {
    const csv = "first_name,last_name,email\nJohn,Doe,john@example.com\nJane,Smith,jane@example.com";
    const rows = parseCsvSimple(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ first_name: "John", last_name: "Doe", email: "john@example.com" });
    expect(rows[1]).toEqual({ first_name: "Jane", last_name: "Smith", email: "jane@example.com" });
  });

  it("trims whitespace from keys and values", () => {
    const csv = "first_name , last_name\n John , Doe ";
    const rows = parseCsvSimple(csv);
    expect(rows[0].first_name).toBe("John");
    expect(rows[0].last_name).toBe("Doe");
  });

  it("handles CRLF line endings", () => {
    const csv = "first_name,email\r\nJohn,john@x.com\r\nJane,jane@x.com";
    expect(parseCsvSimple(csv)).toHaveLength(2);
  });

  it("filters out completely blank rows", () => {
    const csv = "first_name,email\nJohn,john@x.com\n,,\nJane,jane@x.com";
    expect(parseCsvSimple(csv)).toHaveLength(2);
  });

  it("handles quoted fields with commas in data", () => {
    const csv = `name,address\n"Smith, John","123 Main St, NY"`;
    const rows = parseCsvSimple(csv);
    expect(rows[0].name).toBe("Smith, John");
    expect(rows[0].address).toBe("123 Main St, NY");
  });

  it("returns empty for empty string", () => {
    expect(parseCsvSimple("")).toEqual([]);
  });
});

// ── validateImportRows ────────────────────────────────────────────────────────

describe("validateImportRows — participants", () => {
  it("accepts a valid participant row", () => {
    const rows = [{ first_name: "Priya", last_name: "Sharma", email: "priya@example.com" }];
    const result = validateImportRows(rows, "participants");
    expect(result.valid_rows).toBe(1);
    expect(result.error_rows).toBe(0);
    expect(result.validation_report[0]).toHaveLength(0);
  });

  it("rejects a row missing first_name", () => {
    const rows = [{ first_name: "", last_name: "Sharma", email: "priya@example.com" }];
    const result = validateImportRows(rows, "participants");
    expect(result.error_rows).toBe(1);
    expect(result.validation_report[0].some(e => e.field === "first_name")).toBe(true);
  });

  it("rejects a row with invalid email", () => {
    const rows = [{ first_name: "Priya", last_name: "Sharma", email: "not-an-email" }];
    const result = validateImportRows(rows, "participants");
    expect(result.error_rows).toBe(1);
    expect(result.validation_report[0].some(e => e.field === "email")).toBe(true);
  });

  it("reports row number starting from 2 (accounting for header row)", () => {
    const rows = [{ first_name: "", last_name: "", email: "" }];
    const result = validateImportRows(rows, "participants");
    expect(result.validation_report[0][0].row).toBe(2);
  });

  it("counts multiple rows correctly", () => {
    const rows = [
      { first_name: "Good", last_name: "Row", email: "good@x.com" },
      { first_name: "",     last_name: "Bad", email: "bad@x.com" },
      { first_name: "Also", last_name: "Good", email: "also@x.com" },
    ];
    const result = validateImportRows(rows, "participants");
    expect(rows.length).toBe(3);
    expect(result.valid_rows).toBe(2);
    expect(result.error_rows).toBe(1);
  });
});

describe("validateImportRows — coupons", () => {
  it("accepts a valid coupon row", () => {
    const rows = [{ code: "SAVE10", discount_type: "percent", discount_value: "10" }];
    const result = validateImportRows(rows, "coupons");
    expect(result.valid_rows).toBe(1);
    expect(result.error_rows).toBe(0);
  });

  it("rejects invalid discount_type", () => {
    const rows = [{ code: "SAVE10", discount_type: "dollar", discount_value: "10" }];
    const result = validateImportRows(rows, "coupons");
    expect(result.error_rows).toBe(1);
    expect(result.validation_report[0].some(e => e.field === "discount_type")).toBe(true);
  });

  it("rejects zero or negative discount_value", () => {
    const rows = [{ code: "SAVE10", discount_type: "percent", discount_value: "-5" }];
    const result = validateImportRows(rows, "coupons");
    expect(result.error_rows).toBe(1);
    expect(result.validation_report[0].some(e => e.field === "discount_value")).toBe(true);
  });
});

describe("validateImportRows — merchandise", () => {
  it("rejects negative price", () => {
    const rows = [{ name: "T-Shirt", sku: "TS-001", price: "-100" }];
    const result = validateImportRows(rows, "merchandise");
    expect(result.error_rows).toBe(1);
    expect(result.validation_report[0].some(e => e.field === "price")).toBe(true);
  });

  it("accepts zero price (free item)", () => {
    const rows = [{ name: "T-Shirt", sku: "TS-001", price: "0" }];
    const result = validateImportRows(rows, "merchandise");
    expect(result.valid_rows).toBe(1);
  });
});
