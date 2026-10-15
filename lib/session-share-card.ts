/**
 * The content of a session's share image: what is shown, and what is left out when a detail is missing.
 * Pure functions only, so the rules can be tested without rendering an image.
 *
 * Nothing is invented: a missing or unreadable date, time or venue is left out, never shown as a placeholder.
 */

export interface CardSession {
  title: string;
  date: string | null;
  time: string | null;
  venue: string | null;
  location: string | null;
  photo_url: string | null;
}

export interface CardModel {
  kicker: string;
  title: string;
  dateLabel: string | null;
  timeLabel: string | null;
  venueLabel: string | null;
  photoUrl: string | null;
  ctaLabel: string;
}

export type ShareFormat = "story" | "whatsapp";

export const SHARE_FORMAT_SIZE: Record<ShareFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  whatsapp: { width: 1080, height: 1350 },
};

const FALLBACK_TITLE = "Community Session";

/** A short label for the kind of session, from its title. Defaults to a neutral label. */
export function kickerFor(title: string): string {
  const t = title.toLowerCase();
  if (/strength|condition|gym|lift|weights/.test(t)) return "Strength & Conditioning";
  if (/yoga|mobility|stretch|pilates/.test(t)) return "Mobility & Recovery";
  if (/cycl|ride|bike/.test(t)) return "Cycling";
  if (/run|5k|10k|marathon|jog|trail/.test(t)) return "Community Run";
  return "Community Session";
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Friday, 16 October 2026" for a real calendar date (YYYY-MM-DD); null for anything else. */
export function formatCardDate(date: string | null | undefined): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const real = new Date(Date.UTC(y, m - 1, d));
  if (real.getUTCFullYear() !== y || real.getUTCMonth() !== m - 1 || real.getUTCDate() !== d) return null;
  return `${WEEKDAYS[real.getUTCDay()]}, ${d} ${MONTHS[m - 1]} ${y}`;
}

/** "6:00 AM" from "06:00" or "6:00 am"; null when the time is not a clock time. */
export function formatCardTime(time: string | null | undefined): string | null {
  if (!time) return null;
  const match = /^\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])?\s*$/.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59) return null;
  if (match[3]) {
    if (hour < 1 || hour > 12) return null;
    return `${hour}:${String(minute).padStart(2, "0")} ${match[3].toUpperCase()}`;
  }
  if (hour > 23) return null;
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${period}`;
}

/** The venue, or the location when there is no venue; null when neither is set. */
export function cardVenue(session: Pick<CardSession, "venue" | "location">): string | null {
  const venue = (session.venue ?? "").trim() || (session.location ?? "").trim();
  return venue.length > 0 ? venue : null;
}

/** Everything the share image shows for one session. */
export function buildCardModel(session: CardSession): CardModel {
  const title = (session.title ?? "").trim() || FALLBACK_TITLE;
  return {
    kicker: kickerFor(title),
    title,
    dateLabel: formatCardDate(session.date),
    timeLabel: formatCardTime(session.time),
    venueLabel: cardVenue(session),
    photoUrl: session.photo_url && /^https:\/\//.test(session.photo_url) ? session.photo_url : null,
    ctaLabel: "Join this run",
  };
}

/** Title size for a given length, so long titles wrap in a bounded size rather than overflowing. */
export function titleFontSize(title: string, format: ShareFormat): number {
  const base = format === "story" ? 120 : 96;
  if (title.length <= 14) return base;
  if (title.length <= 24) return Math.round(base * 0.8);
  return Math.round(base * 0.62);
}
