-- ============================================================
-- Migration 20260925000018 — IT Run Sprint-2 category updates
--
-- Updates category prices to confirmed Sprint-2 pricing and
-- renames the 1.5K Kid category to the 2K Parent & Child Duo.
--
-- Old → New prices:
--   10k-timed  ₹799  → ₹999
--   5k-timed   ₹599  → ₹799
--   5k-fun-run ₹399  → ₹649
--   5k-duo     ₹999  → ₹1,399
--   1-5k-kid   ₹299  → ₹999 (+ renamed to 2k-kid, distance 1.5 → 2.0)
--
-- No registrations exist yet (pre-launch); the slug rename is safe.
-- RLS and policies are unchanged.
-- ============================================================

DO $$
DECLARE
  v_event_id UUID;
BEGIN
  SELECT id INTO v_event_id
  FROM public.it_run_events
  WHERE slug = 'sprint-2';

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Sprint-2 event not found';
  END IF;

  -- ── Update prices for all existing categories ───────────────────────────────
  UPDATE public.it_run_categories
  SET price_rupees = CASE slug
    WHEN '10k-timed'  THEN 999
    WHEN '5k-timed'   THEN 799
    WHEN '5k-fun-run' THEN 649
    WHEN '5k-duo'     THEN 1399
  END
  WHERE event_id = v_event_id
    AND slug IN ('10k-timed', '5k-timed', '5k-fun-run', '5k-duo');

  -- ── Rename and reprice the kid category ────────────────────────────────────
  -- slug: 1-5k-kid → 2k-kid
  -- name: 1.5K Run with Kid → 2K Parent & Child Duo
  -- distance_km: 1.5 → 2.0
  -- price_rupees: 299 → 999
  UPDATE public.it_run_categories
  SET
    slug        = '2k-kid',
    name        = '2K Parent & Child Duo',
    distance_km = 2.0,
    price_rupees = 999,
    description = 'Run with your child (age 10 or under) — entry price covers parent + child'
  WHERE event_id = v_event_id
    AND slug = '1-5k-kid';

END $$;
