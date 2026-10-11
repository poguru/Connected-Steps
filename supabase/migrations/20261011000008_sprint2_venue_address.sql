-- IT Run Sprint-2: venue address (confirmed by the organiser).
-- Data only, for the sprint-2 event row. Idempotent. Runs after 20261011000007.

UPDATE public.it_run_events
SET venue_address = 'Hyderabad Central University, Prof. C.R. Rao Road, P.O. Central University, Gachibowli, Hyderabad – 500046, Telangana, India'
WHERE slug = 'sprint-2';
