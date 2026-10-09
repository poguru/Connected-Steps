-- Migration: 20261010000002_kid_category_distance.sql
--
-- The Parent & Child Duo category's distance is 1.5 km. Migration 20260925000018 set it to 2.0 km,
-- and the registration page masked the value with a hardcoded "< 2 ? 1.5" rule, so the event page
-- (2 KM) and the registration flow (1.5 KM) disagreed. The database is now the single source of truth.
--
-- Safe to re-run: sets the value, so repeating it changes nothing.
-- Changes only distance_km for the sprint-2 category with slug 2k-kid. No registration, price,
-- capacity, participant, or payment is touched.

UPDATE public.it_run_categories
SET distance_km = 1.5
WHERE slug = '2k-kid'
  AND event_id = (SELECT id FROM public.it_run_events WHERE slug = 'sprint-2')
  AND distance_km IS DISTINCT FROM 1.5;
