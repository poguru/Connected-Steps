-- IT Run Sprint-2: venue and tagline.
--
-- Venue: Hyderabad Central University, Gachibowli. The street address is not yet confirmed, so venue_address is cleared
-- rather than left showing the previous venue. maps_url is cleared for the same reason; the page builds a map search
-- from the venue name when it is empty.
-- Tagline: "Run Beyond the Screen. Break the Loop."
--
-- Data only, for the sprint-2 event row. Idempotent. No registration, payment, or BIB record is changed.

UPDATE public.it_run_events
SET
  venue_name    = 'Hyderabad Central University',
  city          = 'Gachibowli, Hyderabad',
  venue_address = NULL,
  maps_url      = NULL,
  tagline       = 'Run Beyond the Screen. Break the Loop.'
WHERE slug = 'sprint-2';
