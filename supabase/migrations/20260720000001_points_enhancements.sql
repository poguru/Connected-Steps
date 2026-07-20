-- Points system enhancements
-- 1. Extend category CHECK to include weekly_bonus
-- 2. Add week_key column for dedup of weekly bonus rows
-- 3. Add unique partial index so only one weekly_bonus row per user per ISO week

ALTER TABLE public.points_ledger DROP CONSTRAINT IF EXISTS points_ledger_category_check;
ALTER TABLE public.points_ledger
  ADD CONSTRAINT points_ledger_category_check
  CHECK (category IN (
    'attendance', 'bonus', 'streak',
    'challenge', 'referral', 'strava',
    'admin_adjustment', 'weekly_bonus'
  ));

-- week_key stores the ISO Monday date ('YYYY-MM-DD') for the week the bonus was earned.
-- NULL for all non-weekly_bonus rows.
ALTER TABLE public.points_ledger ADD COLUMN IF NOT EXISTS week_key TEXT;

-- Enforce exactly one weekly_bonus row per user per ISO week.
-- The partial WHERE clause means this only applies to bonus rows, leaving all
-- other categories completely unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS points_ledger_weekly_bonus_dedup
  ON public.points_ledger (user_email, week_key)
  WHERE category = 'weekly_bonus';

-- Supporting index for the history API (category filter, email lookup)
CREATE INDEX IF NOT EXISTS points_ledger_category_email_idx
  ON public.points_ledger (user_email, category, created_at DESC);
