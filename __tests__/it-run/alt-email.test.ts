/**
 * Optional alternative email: normalised and validated, and every message reaches the primary and the alternative address
 * once each, never a duplicate.
 */

import { normalizeAltEmail, recipientsFor } from "@/lib/it-run-alt-email";

describe("normalizeAltEmail", () => {
  it("is optional: an empty value is stored as null", () => {
    expect(normalizeAltEmail("")).toEqual({ ok: true, value: null });
    expect(normalizeAltEmail("   ")).toEqual({ ok: true, value: null });
    expect(normalizeAltEmail(undefined)).toEqual({ ok: true, value: null });
  });

  it("accepts a valid address and trims surrounding whitespace", () => {
    expect(normalizeAltEmail("  asha.personal@gmail.com  ")).toEqual({ ok: true, value: "asha.personal@gmail.com" });
  });

  it("rejects an invalid address with a clear message", () => {
    const r = normalizeAltEmail("asha@");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/valid alternative email/);
  });

  it("rejects a value that is not text", () => {
    expect(normalizeAltEmail(42)).toMatchObject({ ok: false });
  });
});

describe("recipientsFor", () => {
  it("sends to the primary and the alternative address", () => {
    expect(recipientsFor(["asha@company.com", "asha.personal@gmail.com"])).toEqual(["asha@company.com", "asha.personal@gmail.com"]);
  });

  it("sends once when the two addresses are the same, ignoring case and spaces", () => {
    expect(recipientsFor(["Asha@Company.com", " asha@company.com "])).toEqual(["Asha@Company.com"]);
  });

  it("keeps the primary address when there is no alternative", () => {
    expect(recipientsFor(["asha@company.com", null])).toEqual(["asha@company.com"]);
    expect(recipientsFor(["asha@company.com", undefined, ""])).toEqual(["asha@company.com"]);
  });

  it("keeps each participant's own alternative address, and does not reuse one for everyone", () => {
    const asha = recipientsFor(["asha@company.com", "asha.home@gmail.com"]);
    const ravi = recipientsFor(["ravi@company.com", null]);
    expect(asha).toEqual(["asha@company.com", "asha.home@gmail.com"]);
    expect(ravi).toEqual(["ravi@company.com"]);
    expect(ravi).not.toContain("asha.home@gmail.com");
  });
});
