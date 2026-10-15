/**
 * The moment the IT Run starts, for the countdown: the event date at the configured flag-off time, in India time
 * (the event is in Hyderabad, and India has no daylight saving). A missing or unreadable flag-off time falls back to
 * 6:00 AM, the same default the event configuration uses.
 */

const DEFAULT_START = { hour: 6, minute: 0 };

/** "6:00 AM" -> { hour: 6, minute: 0 }. Returns null when the text is not a clock time. */
export function parseClockTime(text: string | null | undefined): { hour: number; minute: number } | null {
  const match = /^\s*(\d{1,2}):(\d{2})\s*([AP]M)\s*$/i.exec(text ?? "");
  if (!match) return null;
  const hour12 = Number(match[1]);
  const minute = Number(match[2]);
  if (hour12 < 1 || hour12 > 12 || minute > 59) return null;
  const pm = match[3].toUpperCase() === "PM";
  const hour = (hour12 % 12) + (pm ? 12 : 0);
  return { hour, minute };
}

/** The start instant for the event date (YYYY-MM-DD), or null when the date is not a real calendar date. */
export function eventStartDate(eventDate: string | null | undefined, flagOffTime: string | null | undefined): Date | null {
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null;
  // The date must exist: 2027-02-31 is refused rather than rolled over to March
  const [y, m, d] = eventDate.split("-").map(Number);
  const real = new Date(Date.UTC(y, m - 1, d));
  if (real.getUTCFullYear() !== y || real.getUTCMonth() !== m - 1 || real.getUTCDate() !== d) return null;
  const time = parseClockTime(flagOffTime) ?? DEFAULT_START;
  const hh = String(time.hour).padStart(2, "0");
  const mm = String(time.minute).padStart(2, "0");
  const start = new Date(`${eventDate}T${hh}:${mm}:00+05:30`);
  return Number.isNaN(start.getTime()) ? null : start;
}
