// Shared date/time helpers. Always use these instead of inline
// toLocaleDateString() calls so timezone handling is consistent.
//
// WHY T12:00:00Z: Dates stored as "YYYY-MM-DD" are midnight UTC.
// Parsing them as-is in IST (UTC+5:30) makes them shift to the previous
// calendar day. Anchoring to noon UTC means local-time offsets of up to
// ±11h cannot cross a day boundary.

export function formatEventDate(date: string): string {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export function formatEventTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// Returns "12 Jul 2026, 6:00 AM" or just the date when no time is given
export function formatEventDateTime(date: string, time?: string | null): string {
  const d = formatEventDate(date);
  return time ? `${d}, ${formatEventTime(time)}` : d;
}
