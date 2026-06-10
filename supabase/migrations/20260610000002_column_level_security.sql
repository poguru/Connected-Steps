-- ============================================================
-- Connected Steps — Column-Level Security
-- File:    20260610000002_column_level_security.sql
-- Date:    2026-06-10
--
-- Migration 000001 grants anon SELECT on `leaderboard` and
-- `session_attendance` for Realtime subscriptions. Both tables
-- contain `user_email`. This migration hides that column from
-- the anon role using column-level privileges.
-- ============================================================

DO $$
BEGIN

  -- ── leaderboard ─────────────────────────────────────────────────────────────
  -- Actual columns: id, user_email, user_name, location, goal,
  --                 month_points, total_points, week_points,
  --                 prev_month_rank, updated_at
  -- Grant all except user_email.

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'leaderboard') THEN
    REVOKE ALL ON public.leaderboard FROM anon;
    GRANT SELECT (
      id,
      user_name,
      location,
      goal,
      month_points,
      total_points,
      prev_month_rank,
      updated_at
    ) ON public.leaderboard TO anon;

    -- Grant week_points only if the column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'leaderboard' AND column_name = 'week_points'
    ) THEN
      GRANT SELECT (week_points) ON public.leaderboard TO anon;
    END IF;

    RAISE NOTICE 'Column-level security applied to leaderboard';
  ELSE
    RAISE NOTICE 'Table not found, skipped: leaderboard';
  END IF;

  -- ── session_attendance ───────────────────────────────────────────────────────
  -- Actual columns: session_id, user_email, user_name, attended,
  --                 bonus_points, bonus_reason, points_synced
  -- Grant only session_id, attended, points_synced — hides emails and names.

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'session_attendance') THEN
    REVOKE ALL ON public.session_attendance FROM anon;
    GRANT SELECT (
      session_id,
      attended,
      points_synced
    ) ON public.session_attendance TO anon;

    RAISE NOTICE 'Column-level security applied to session_attendance';
  ELSE
    RAISE NOTICE 'Table not found, skipped: session_attendance';
  END IF;

  RAISE NOTICE 'Column-level security migration complete.';

END;
$$;
