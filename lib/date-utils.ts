// Shared date/time helpers. Always use these instead of inline
// toLocaleDateString() calls so timezone handling is consistent.
//
// WHY T12:00:00Z: Dates stored as "YYYY-MM-DD" are midnight UTC.
// Parsing them as-is in IST (UTC+5:30) makes them shift to the previous
// calendar day. Anchoring to noon UTC means local-time offsets of up to
// ±11h cannot cross a day boundary.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// ── IST helpers ───────────────────────────────────────────────────────────────

/** Returns the current instant expressed in IST (UTC+5:30). */
export function getISTNow(): Date {
  return new Date(Date.now() + IST_OFFSET_MS);
}

/** Shifts any UTC Date to IST by adding the offset. Result is a plain Date
 *  whose getUTCHours/Minutes etc. return IST values. */
export function toIST(d: Date): Date {
  return new Date(d.getTime() + IST_OFFSET_MS);
}

// ── Calendar predicates (all use IST) ────────────────────────────────────────

function istDateString(d: Date): string {
  const ist = toIST(d);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
}

/** True if the date falls on today in IST. */
export function isToday(date: Date): boolean {
  return istDateString(date) === istDateString(new Date());
}

/** True if the date falls on tomorrow in IST. */
export function isTomorrow(date: Date): boolean {
  const tomorrow = new Date(Date.now() + 86_400_000);
  return istDateString(date) === istDateString(tomorrow);
}

/** True if the date is strictly in the past (before now). */
export function isPast(date: Date): boolean {
  return date.getTime() < Date.now();
}

// ── Countdown ─────────────────────────────────────────────────────────────────

interface Countdown {
  days:    number;
  hours:   number;
  minutes: number;
  seconds: number;
  total:   number; // ms remaining (negative if past)
}

/** Returns a breakdown of time remaining until the target date. */
export function countdown(target: Date): Countdown {
  const total   = target.getTime() - Date.now();
  const abs     = Math.abs(total);
  const seconds = Math.floor((abs / 1000) % 60);
  const minutes = Math.floor((abs / (1000 * 60)) % 60);
  const hours   = Math.floor((abs / (1000 * 60 * 60)) % 24);
  const days    = Math.floor(abs / (1000 * 60 * 60 * 24));
  return { days, hours, minutes, seconds, total };
}

// ── Event date/time formatters ────────────────────────────────────────────────

export function formatEventDate(date: string): string {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export function formatEventTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** Returns "12 Jul 2026, 6:00 AM" or just the date when no time is given. */
export function formatEventDateTime(date: string, time?: string | null): string {
  const d = formatEventDate(date);
  return time ? `${d}, ${formatEventTime(time)}` : d;
}

/** Short date for email digests: "Mon, 12 Jul". */
export function formatShortDate(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string"
    ? new Date(isoOrDate + (isoOrDate.length === 10 ? "T12:00:00Z" : ""))
    : isoOrDate;
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

/** Long date: "12 July 2026". */
export function formatLongDate(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string"
    ? new Date(isoOrDate + (isoOrDate.length === 10 ? "T12:00:00Z" : ""))
    : isoOrDate;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}
