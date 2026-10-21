import { registrationSource } from "../helpers/registration-source";
/**
 * The alternative email is wired through the form, the server's validation and saves, the migration, and every booking
 * email's recipient list. Each booking reads only its own participants.
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("alternative email is wired end to end", () => {
  it("the form has an optional alternative email field with the agreed helper text", () => {
    const page = read("app/it-run/register/page.tsx");
    expect(page).toMatch(/label="Alternative email"/);
    expect(page).toMatch(/Use a personal email address if your company email blocks event updates or confirmation emails\./);
    expect(page).toMatch(/normalizeAltEmail\(p\.altEmail\)/);
  });

  it("the server validates it, and saves it per participant on create and on edit", () => {
    const route = registrationSource();
    expect(route).toMatch(/normalizeAltEmail\(p\.altEmail\)/);
    expect(route).toMatch(/alt_email:\s+altEmailOrNull\(p\.altEmail\)/);
    expect((route.match(/alt_email:\s+altEmailOrNull\(p\.altEmail\)/g) ?? []).length).toBe(2);
  });

  it("the migration adds a nullable column and touches no existing data", () => {
    const sql = read("supabase/migrations/20261025000001_participant_alt_email.sql");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS alt_email TEXT;/);
    expect(sql).not.toMatch(/UPDATE|DROP|NOT NULL/);
  });

  it("every booking email reads each participant's own alternative address", () => {
    const email = read("lib/it-run-email.ts");
    expect(email).toMatch(/alternativeEmailsFor\(db, reg\.id\)/);
    expect(email).toMatch(/\.eq\("registration_id", registrationId\)/);
    expect(email).toMatch(/recipientsFor\(\[leadEmail, linkedUserEmail, \.\.\.alternativeEmails\]\)/);
  });
});
