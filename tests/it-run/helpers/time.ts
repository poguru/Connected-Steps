// Event date for IT Run Sprint 2
export const EVENT_DATE = new Date("2027-02-07T00:00:00.000Z");
export const EVENT_DATE_MS = EVENT_DATE.getTime();

/**
 * Returns a DOB (ISO date string) that makes a person the given age on the event date.
 * E.g. ageOnEventDay(10) → DOB such that the person turns 10 exactly on event day.
 */
export function dobForAge(ageOnEventDay: number, dayOffset = 0): string {
  const dob = new Date(EVENT_DATE);
  dob.setFullYear(dob.getFullYear() - ageOnEventDay);
  dob.setDate(dob.getDate() + dayOffset);
  return dob.toISOString().split("T")[0];
}

/** Max valid child DOB: just turned 10 on event day (age < 11 on event date). */
export const CHILD_DOB_AGE_10_EXACT     = dobForAge(10, 0);  // turns 10 on event day → allowed
export const CHILD_DOB_AGE_10_MINUS_1   = dobForAge(10, 1);  // one day before 10th bday → age 9.99... → allowed
export const CHILD_DOB_AGE_11_EXACT     = dobForAge(11, 0);  // turns 11 on event day → REJECTED (ageOnEventDay >= 11)
export const CHILD_DOB_AGE_11_PLUS_1    = dobForAge(11, -1); // already 11 for 1 day → REJECTED
export const CHILD_DOB_AGE_6_EXACT      = dobForAge(6, 0);
export const CHILD_DOB_AGE_5            = dobForAge(5, 0);

/** A typical adult DOB (35 years old on event day). */
export const ADULT_DOB = dobForAge(35);

/** A DOB that is a future date (always invalid). */
export function futureDob(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split("T")[0];
}

/** Today's date (valid adult, but borderline for child check). */
export function todayDob(): string {
  return new Date().toISOString().split("T")[0];
}
