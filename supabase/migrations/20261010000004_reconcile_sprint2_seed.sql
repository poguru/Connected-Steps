-- Migration: 20261010000004_reconcile_sprint2_seed.sql
--
-- Production has drifted from the earlier seed migrations (values were corrected in the admin tools).
-- This migration brings a database that still has the old seed values in line with what production
-- already shows. Every statement is guarded, so it changes nothing where the value is already correct.
--
-- Changes (only these):
--   1. Event date 2026-08-17 -> 2027-02-07, registration close 2027-01-31 23:59 UTC (as production stores it), for slug sprint-2.
--   2. Parent & Child category slug 2k-kid -> parent-child-duo, name "Parent & Child Duo".
--
-- Not changed here: BIB collection slots and counters (managed in the admin tool), prices, capacity,
-- registrations, payments, participants, QR tokens, and BIB allocations.

-- 1. Event dates
UPDATE public.it_run_events
SET event_date = DATE '2027-02-07'
WHERE slug = 'sprint-2'
  AND event_date IS DISTINCT FROM DATE '2027-02-07';

UPDATE public.it_run_events
SET registration_closes_at = TIMESTAMPTZ '2027-01-31 23:59:00+00'
WHERE slug = 'sprint-2'
  AND registration_closes_at IS DISTINCT FROM TIMESTAMPTZ '2027-01-31 23:59:00+00';

-- 2. Parent & Child category slug and name (matched on the old slug only)
UPDATE public.it_run_categories
SET slug = 'parent-child-duo',
    name = 'Parent & Child Duo'
WHERE slug = '2k-kid'
  AND event_id = (SELECT id FROM public.it_run_events WHERE slug = 'sprint-2')
  AND NOT EXISTS (
    SELECT 1 FROM public.it_run_categories c2
    WHERE c2.slug = 'parent-child-duo'
      AND c2.event_id = (SELECT id FROM public.it_run_events WHERE slug = 'sprint-2')
  );
