/**
 * IT Run registration validation: email and date of birth.
 *
 * Pure functions with no server or browser dependencies, so the same rules run in the
 * registration form (for immediate feedback) and in the API (the authority).
 *
 * Age rules (from the existing event configuration in code, not invented here):
 *   - Adult participants (solo, duo, and the parent of a kid category): at least 18 on the event date.
 *   - Child participants (kid category only): 5 to 10 years old on the event date.
 *     The category has no configured minimum child age, so none is enforced.
 *   - Ages are calendar-based: age = event year - birth year, minus one if the birthday has
 *     not yet occurred on the reference date. A Feb 29 birthday counts as Mar 1 in non-leap years.
 */

// ── Email ───────────────────────────────────────────────────────────────────────

/** RFC 5321 maximum for a full address. */
export const EMAIL_MAX_LENGTH = 254;
/** RFC 5321 maximum for the local part (before @). */
export const EMAIL_LOCAL_MAX_LENGTH = 64;

// RFC 5322 "atext" characters, dot-separated, no leading/trailing/consecutive dots.
const EMAIL_LOCAL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
// RFC 1035 host label: letters/digits, hyphens allowed inside, 1-63 chars.
const DOMAIN_LABEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
// Top-level domain: letters only, at least two characters (rejects IP-like domains).
const TLD_RE = /^[A-Za-z]{2,63}$/;

/** Trim and lowercase. Used for storage, account lookup, and duplicate detection. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * True when the value is a syntactically valid email address.
 * Accepts any provider or company domain (not only gmail.com). Does not prove the inbox exists.
 */
export function isValidEmail(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const email = value.trim();
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return false;
  if (/\s/.test(email)) return false;

  const at = email.indexOf("@");
  if (at === -1 || email.indexOf("@", at + 1) !== -1) return false; // exactly one @

  const local  = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length === 0 || local.length > EMAIL_LOCAL_MAX_LENGTH || !EMAIL_LOCAL_RE.test(local)) return false;

  if (domain.length === 0 || domain.length > 253) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;                         // requires a dot (e.g. user@localhost is rejected)
  if (!labels.every(label => DOMAIN_LABEL_RE.test(label))) return false; // rejects "a..b", "-a", "a-"
  return TLD_RE.test(labels[labels.length - 1]);
}

// ── Dates ───────────────────────────────────────────────────────────────────────

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
}

/** Earliest date of birth accepted anywhere in the registration flow. */
export const DOB_MIN_DATE: CalendarDate = { year: 1900, month: 1, day: 1 };

/** Adults must be at least this old on the event date. */
export const ADULT_MIN_AGE = 18;
/** Children must be at least this old on the event date (kid category). */
export const CHILD_MIN_AGE = 5;
/** Children must be at most this old on the event date (kid category). */
export const CHILD_MAX_AGE = 10;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this month. Date.UTC avoids local timezone shifts.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Strictly parses a YYYY-MM-DD string. Rejects impossible dates such as 2026-02-31,
 * which `new Date()` would silently roll over into March.
 */
export function parseCalendarDate(value: unknown): CalendarDate | null {
  if (typeof value !== "string") return null;
  const match = ISO_DATE_RE.exec(value.trim());
  if (!match) return null;
  const year  = Number(match[1]);
  const month = Number(match[2]);
  const day   = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return null;
  if (day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** Sortable number for comparing calendar dates (YYYYMMDD). */
function dateKey(d: CalendarDate): number {
  return d.year * 10000 + d.month * 100 + d.day;
}

export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return dateKey(a) - dateKey(b);
}

/** Age in whole years on `onDate` for someone born on `birth`. Both are calendar dates, so no timezone is involved. */
export function calendarAge(birth: CalendarDate, onDate: CalendarDate): number {
  let age = onDate.year - birth.year;
  if (onDate.month < birth.month || (onDate.month === birth.month && onDate.day < birth.day)) {
    age -= 1;
  }
  return age;
}

/** Today's date in India Standard Time, the timezone the event runs in. */
export function todayInIST(now: Date = new Date()): CalendarDate {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parseCalendarDate(iso) as CalendarDate;
}

export type DobErrorCode =
  | "required"
  | "invalid"
  | "future"
  | "before_minimum"
  | "adult_too_young"
  | "child_out_of_range";

export const DOB_ERROR_MESSAGES: Record<DobErrorCode, string> = {
  required:          "Date of birth is required.",
  invalid:           "Please enter a valid date of birth.",
  future:            "Date of birth cannot be in the future.",
  before_minimum:    "Please enter a valid date of birth.",
  adult_too_young:   `You must be at least ${ADULT_MIN_AGE} years old to register for this category.`,
  child_out_of_range: "Please check the age eligibility requirements for this category.",
};

export type DobResult =
  | { ok: true; dob: CalendarDate; ageOnEventDate: number }
  | { ok: false; code: DobErrorCode; message: string };

function fail(code: DobErrorCode): { ok: false; code: DobErrorCode; message: string } {
  return { ok: false, code, message: DOB_ERROR_MESSAGES[code] };
}

/**
 * Validates one participant's date of birth against the age policy.
 * @param value      Raw date of birth (YYYY-MM-DD expected).
 * @param isChild    True for the child in a kid category.
 * @param eventDate  Event date (YYYY-MM-DD string or parsed date): the age reference date.
 * @param today      Today in IST. Injected so tests and the server use the same clock.
 */
export function validateDateOfBirth(
  value: unknown,
  opts: { isChild: boolean; eventDate: CalendarDate; today: CalendarDate },
): DobResult {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    return fail("required");
  }
  const dob = parseCalendarDate(value);
  if (!dob) return fail("invalid");
  if (compareCalendarDates(dob, DOB_MIN_DATE) < 0) return fail("before_minimum");
  if (compareCalendarDates(dob, opts.today) > 0) return fail("future");

  const ageOnEventDate = calendarAge(dob, opts.eventDate);
  if (opts.isChild) {
    // Below the minimum also covers children born after the event date (negative age)
    if (ageOnEventDate < CHILD_MIN_AGE || ageOnEventDate > CHILD_MAX_AGE) return fail("child_out_of_range");
  } else if (ageOnEventDate < ADULT_MIN_AGE) {
    return fail("adult_too_young");
  }
  return { ok: true, dob, ageOnEventDate };
}

// ── Phone numbers ─────────────────────────────────────────────────────────────

/**
 * The 10-digit Indian mobile number, or null. Accepts the bare 10 digits or the same number with a +91 country code
 * (any spacing or hyphens). Anything else is null, so a bad number is never guessed at.
 */
export function normalizeIndianPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  return /^\d{10}$/.test(digits) ? digits : null;
}

/**
 * What the phone input keeps while the user types. Digits only, at most 10. A +91 prefix is dropped once it is typed
 * in full, so "+91 98765 43210" becomes 9876543210 and not the first ten digits of the whole string.
 */
export function normalizeIndianPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  return digits.slice(0, 10);
}

/**
 * True when the emergency contact is the same person's number as the participant's mobile, after normalization.
 * Either value being invalid is not a match: the format error is reported by its own check.
 */
export function emergencyMatchesMobile(mobile: unknown, emergency: unknown): boolean {
  const m = normalizeIndianPhone(mobile);
  const e = normalizeIndianPhone(emergency);
  return m !== null && e !== null && m === e;
}

/** YYYY-MM-DD for a calendar date, used for the date picker's bounds. */
export function formatCalendarDate(d: CalendarDate): string {
  return `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}
