-- ============================================================
-- Connected Steps — follows UNIQUE constraint
-- File: 20260611000004_follows_unique.sql
-- Date: 2026-06-11
--
-- The follows table had no uniqueness enforcement on
-- (follower_email, following_email).  A rapid double-click or
-- Vercel retry could insert two identical rows, producing
-- duplicate feed entries and broken unfollow behaviour.
--
-- Steps:
--   1. Delete any duplicate rows that already exist (keep the
--      earliest row per pair by id ordering).
--   2. Add a UNIQUE constraint so future concurrent inserts fail
--      atomically — the application uses ON CONFLICT DO NOTHING
--      so the second insert is a no-op, not an error.
--
-- Idempotent: the DO $$ block checks for the constraint before
-- adding it, so this script can be re-run safely.
-- ============================================================

-- 1. Remove duplicate rows (keep smallest id per pair)
DELETE FROM follows
WHERE id NOT IN (
  SELECT MIN(id)
  FROM   follows
  GROUP BY follower_email, following_email
);

-- 2. Add the UNIQUE constraint (idempotent check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conname    = 'follows_unique_pair'
      AND  conrelid   = 'public.follows'::regclass
  ) THEN
    ALTER TABLE public.follows
      ADD CONSTRAINT follows_unique_pair
      UNIQUE (follower_email, following_email);
    RAISE NOTICE '[follows] Added UNIQUE constraint follows_unique_pair';
  ELSE
    RAISE NOTICE '[follows] follows_unique_pair already exists — skipped';
  END IF;
END;
$$;
