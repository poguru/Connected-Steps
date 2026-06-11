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

-- 1. Remove duplicate rows, keeping one row per (follower, following) pair.
--    ctid is the physical row address — always comparable, works on any column type.
--    The row with the smaller ctid (earliest physical position) is kept.
DELETE FROM follows f1
USING follows f2
WHERE f1.follower_email  = f2.follower_email
  AND f1.following_email = f2.following_email
  AND f1.ctid > f2.ctid;

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
