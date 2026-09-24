-- Update IT Run Sprint-2 event date to February 7, 2027.
--
-- Sprint 2 was originally seeded with event_date = 2026-08-17 (past).
-- This migration updates the event record and BIB collection slot dates
-- to the confirmed Sprint 2 date of February 7, 2027.
--
-- No structural schema changes — data update only.
-- Does not touch any other event or the main CS events platform.

-- ── Event record ───────────────────────────────────────────────────────────────

UPDATE public.it_run_events
SET
  event_date             = '2027-02-07',
  registration_closes_at = '2027-01-31 23:59:59+05:30',
  status                 = 'upcoming'
WHERE slug = 'sprint-2';

-- ── BIB collection slots ────────────────────────────────────────────────────────
-- Shift the three seeded slot dates proportionally before the new event date.
-- Aug 14 → Feb 4 (3 days before)
-- Aug 15 → Feb 5 (2 days before)
-- Aug 16 → Feb 6 (1 day before)

UPDATE public.it_run_bib_slots
SET slot_date =
  CASE slot_date
    WHEN '2026-08-14' THEN '2027-02-04'
    WHEN '2026-08-15' THEN '2027-02-05'
    WHEN '2026-08-16' THEN '2027-02-06'
    ELSE slot_date
  END
WHERE event_id = (SELECT id FROM public.it_run_events WHERE slug = 'sprint-2');
