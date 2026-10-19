/**
 * The IT Run Sprint-2 as shown across the public website (navbar, footer, homepage). One place to change it.
 * The registration page reads its real date, venue and registration times from the database; this file only holds the
 * public promotion, so keep it in step with the event record. To hide the promotion, set FEATURED_EVENT_VISIBLE to false.
 */

export const FEATURED_EVENT_VISIBLE = true;

/** sessionStorage key: set once the popup has been shown or dismissed in this browsing session. */
export const POPUP_SEEN_KEY = "cs_flagship_popup_seen";

/**
 * Routes where the popup must never appear: sign-in, registration, dashboards, checkout and payment, and any page where
 * a person is mid-task. A path is excluded when it equals a prefix or starts with it followed by "/".
 */
export const POPUP_EXCLUDED_PREFIXES = [
  "/auth", "/dashboard", "/admin", "/it-run", "/events/it-run-sprint-2",
  "/checkout", "/payment", "/pricing", "/join", "/invite", "/my-events", "/ops",
  "/event-checkin", "/event-tshirt", "/delete-account", "/invoices", "/messages",
] as const;

export function popupAllowedOnPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return !POPUP_EXCLUDED_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

export const FEATURED_EVENT = {
  name: "The IT Run",
  edition: "Sprint-2",
  tagline: "Debug the routine. Run the race. Break the loop.",
  /** Calendar date of the event, in Indian time. */
  dateLabel: "7 February 2027",
  /** The one canonical route every link uses. */
  href: "/it-run",
  logo: "/events/it-run-sprint-2/IT Run Sprint-2 Logo (trimmed).png",
} as const;
