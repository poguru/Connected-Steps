/**
 * When IT Run registration is open. Registration opens at registration_opens_at and closes at registration_closes_at.
 * Times are instants; the event runs on Asia/Kolkata time, so the message shows the opening time in IST.
 */

export type RegistrationWindow = "not_open" | "open" | "closed";

export function registrationWindow(
  opensAt: string | null | undefined,
  closesAt: string | null | undefined,
  nowMs: number,
): RegistrationWindow {
  const opens = opensAt ? Date.parse(opensAt) : NaN;
  const closes = closesAt ? Date.parse(closesAt) : NaN;
  if (Number.isFinite(opens) && nowMs < opens) return "not_open";
  if (Number.isFinite(closes) && nowMs >= closes) return "closed";
  return "open";
}

/** "20 Oct 2026, 10:36 AM IST" for a stored instant. */
export function formatIst(instant: string): string {
  const d = new Date(instant);
  if (!Number.isFinite(d.getTime())) return "";
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  return `${date}, ${time} IST`;
}

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/**
 * A time typed in an admin form (datetime-local, no zone) is Indian time. Stored as-is, the database reads it as UTC.
 * This adds the IST offset so the instant is the time the admin typed. Values that already carry a zone are unchanged.
 */
export function istLocalToInstant(value: string): string {
  const v = value.trim();
  if (!LOCAL_DATETIME.test(v)) return v;
  return `${v.length === 16 ? `${v}:00` : v}+05:30`;
}
