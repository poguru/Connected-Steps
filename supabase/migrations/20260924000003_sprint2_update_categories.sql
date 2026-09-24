-- Sprint 2 final category update
-- Rename 1-5k-kid → parent-child-duo, update all prices to final values,
-- update sort_order and inclusions for all 5 categories.

WITH ev AS (SELECT id FROM public.it_run_events WHERE slug = 'sprint-2')
UPDATE public.it_run_categories
SET
  slug                  = 'parent-child-duo',
  name                  = 'Parent & Child Duo',
  price_rupees          = 999,
  sort_order            = 1,
  includes_tshirt       = true,
  includes_medal        = true,
  includes_certificate  = false,
  description           = 'Run together — one parent and one child (age 10 or under). Price covers both.'
WHERE slug = '1-5k-kid'
  AND event_id = (SELECT id FROM ev);

WITH ev AS (SELECT id FROM public.it_run_events WHERE slug = 'sprint-2')
UPDATE public.it_run_categories
SET
  price_rupees          = 649,
  sort_order            = 2,
  includes_tshirt       = true,
  includes_medal        = true,
  includes_certificate  = true
WHERE slug = '5k-fun-run'
  AND event_id = (SELECT id FROM ev);

WITH ev AS (SELECT id FROM public.it_run_events WHERE slug = 'sprint-2')
UPDATE public.it_run_categories
SET
  price_rupees          = 799,
  sort_order            = 3,
  includes_tshirt       = true,
  includes_certificate  = true
WHERE slug = '5k-timed'
  AND event_id = (SELECT id FROM ev);

WITH ev AS (SELECT id FROM public.it_run_events WHERE slug = 'sprint-2')
UPDATE public.it_run_categories
SET
  price_rupees          = 1399,
  sort_order            = 4,
  includes_tshirt       = true,
  includes_certificate  = true
WHERE slug = '5k-duo'
  AND event_id = (SELECT id FROM ev);

WITH ev AS (SELECT id FROM public.it_run_events WHERE slug = 'sprint-2')
UPDATE public.it_run_categories
SET
  price_rupees          = 999,
  sort_order            = 5,
  includes_tshirt       = true,
  includes_certificate  = true
WHERE slug = '10k-timed'
  AND event_id = (SELECT id FROM ev);
