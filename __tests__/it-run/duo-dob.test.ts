import { registrationSource } from "../helpers/registration-source";
/**
 * Date of birth is checked for each person on their own. Two people in one duo may share a date of birth, and each must
 * meet the age rule that applies to them. Nothing compares one participant's DOB with another's.
 */

import fs from "fs";
import path from "path";
import { validateDateOfBirth, parseCalendarDate } from "@/lib/it-run-validation";

const EVENT = parseCalendarDate("2027-02-07")!;
const TODAY = parseCalendarDate("2026-10-17")!;
const opts = (isChild: boolean) => ({ isChild, eventDate: EVENT, today: TODAY });

describe("duo participants' dates of birth", () => {
  it("two adults may share the same date of birth when both meet the adult rule", () => {
    expect(validateDateOfBirth("1990-05-10", opts(false)).ok).toBe(true);
    expect(validateDateOfBirth("1990-05-10", opts(false)).ok).toBe(true);
  });

  it("each person is judged on their own: an adult who is too young fails, whoever shares the date", () => {
    expect(validateDateOfBirth("2015-05-10", opts(false))).toMatchObject({ ok: false, code: "adult_too_young" });
    expect(validateDateOfBirth("1990-05-10", opts(false)).ok).toBe(true);
  });

  it("missing, invalid and future dates are still refused", () => {
    expect(validateDateOfBirth("", opts(false)).ok).toBe(false);
    expect(validateDateOfBirth("1990-02-30", opts(false)).ok).toBe(false);
    expect(validateDateOfBirth("2030-01-01", opts(false)).ok).toBe(false);
  });

  it("the registration route validates each participant's date of birth separately", () => {
    const route = registrationSource();
    expect(route).toMatch(/validateDateOfBirth\(p\.dob, \{ isChild: m\.is_child, eventDate, today \}\)/);
    expect(route).not.toMatch(/dob\s*===?\s*participants/);
  });
});
