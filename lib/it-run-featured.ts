/**
 * The IT Run Sprint-2 as shown across the public website (navbar, footer, homepage). One place to change it.
 * The registration page reads its real date, venue and registration times from the database; this file only holds the
 * public promotion, so keep it in step with the event record. To hide the promotion, set FEATURED_EVENT_VISIBLE to false.
 */

export const FEATURED_EVENT_VISIBLE = true;

export const FEATURED_EVENT = {
  name: "The IT Run",
  edition: "Sprint-2",
  tagline: "Run Beyond the Screen. Break the Loop.",
  /** Calendar date of the event, in Indian time. */
  dateLabel: "7 February 2027",
  /** The one canonical route every link uses. */
  href: "/it-run",
  logo: "/events/it-run-sprint-2/IT Run Sprint-2 Logo (trimmed).png",
} as const;
