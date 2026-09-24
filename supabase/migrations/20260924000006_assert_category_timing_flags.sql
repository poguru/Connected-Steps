-- Assert correct includes_timing for all Sprint 2 categories.
-- The initial seed set these correctly, but this migration makes them
-- explicit and idempotent so the state is guaranteed regardless of any
-- manual changes made before this migration ran.
--
-- 5K Fun Run      — non-timed (casual community run, no chip timing)
-- 5K Timed Run    — timed (competitive with chip timing)
-- 10K Timed Run   — timed (flagship with chip timing)
-- 5K Duo          — timed (partner race with chip timing)
-- Parent & Child  — timed (family timed race)

WITH ev AS (SELECT id FROM public.it_run_events WHERE slug = 'sprint-2')
UPDATE public.it_run_categories
SET includes_timing = false
WHERE slug = '5k-fun-run'
  AND event_id = (SELECT id FROM ev);

WITH ev AS (SELECT id FROM public.it_run_events WHERE slug = 'sprint-2')
UPDATE public.it_run_categories
SET includes_timing = true
WHERE slug = '5k-timed'
  AND event_id = (SELECT id FROM ev);

WITH ev AS (SELECT id FROM public.it_run_events WHERE slug = 'sprint-2')
UPDATE public.it_run_categories
SET includes_timing = true
WHERE slug = '5k-duo'
  AND event_id = (SELECT id FROM ev);

WITH ev AS (SELECT id FROM public.it_run_events WHERE slug = 'sprint-2')
UPDATE public.it_run_categories
SET includes_timing = true
WHERE slug = '10k-timed'
  AND event_id = (SELECT id FROM ev);

WITH ev AS (SELECT id FROM public.it_run_events WHERE slug = 'sprint-2')
UPDATE public.it_run_categories
SET includes_timing = true
WHERE slug = 'parent-child-duo'
  AND event_id = (SELECT id FROM ev);
