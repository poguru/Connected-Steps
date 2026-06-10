-- ============================================================
-- Connected Steps — Row Level Security Migration
-- File:    20260610000001_enable_rls_all_tables.sql
-- Date:    2026-06-10
--
-- SAFE TO RE-RUN. Missing tables are silently skipped.
-- All /api/* routes use the service role key (bypasses RLS),
-- so enabling RLS does NOT break any existing functionality.
-- ============================================================

DO $$
DECLARE
  tbl  TEXT;
  pol  RECORD;

  blocked TEXT[] := ARRAY[
    'users', 'memberships', 'otp_verifications', 'password_resets',
    'training_plans', 'coach_questions', 'coach_ratings', 'session_feedback',
    'messages', 'conversations', 'push_tokens', 'push_subscriptions',
    'user_integrations', 'synced_activities', 'run_registrations',
    'coupons', 'coupon_uses', 'stories', 'follows', 'post_likes',
    'photo_likes', 'photo_comments', 'monthly_leaderboard_archive',
    'cohorts', 'cohort_members', 'plan_templates', 'feed_reactions'
  ];

BEGIN

  -- ── 1. Enable RLS on all sensitive tables (no policies = deny all anon) ────

  FOREACH tbl IN ARRAY blocked LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    ELSE
      RAISE NOTICE 'Table not found, skipped: %', tbl;
    END IF;
  END LOOP;

  -- ── 2. Drop any pre-existing permissive policies on sensitive tables ────────

  FOR pol IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY(blocked)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    RAISE NOTICE 'Dropped policy "%" on "%"', pol.policyname, pol.tablename;
  END LOOP;

  -- ── 3. Public tables: enable RLS + anon SELECT ──────────────────────────────

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sessions') THEN
    ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sessions' AND policyname='sessions_anon_select') THEN
      CREATE POLICY sessions_anon_select ON public.sessions FOR SELECT TO anon USING (true);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'coaches') THEN
    ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='coaches' AND policyname='coaches_anon_select') THEN
      CREATE POLICY coaches_anon_select ON public.coaches FOR SELECT TO anon USING (is_active = true);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'run_events') THEN
    ALTER TABLE public.run_events ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='run_events' AND policyname='run_events_anon_select') THEN
      CREATE POLICY run_events_anon_select ON public.run_events FOR SELECT TO anon USING (true);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'community_posts') THEN
    ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_posts' AND policyname='community_posts_anon_select') THEN
      CREATE POLICY community_posts_anon_select ON public.community_posts FOR SELECT TO anon USING (approved = true);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'community_replies') THEN
    ALTER TABLE public.community_replies ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_replies' AND policyname='community_replies_anon_select') THEN
      CREATE POLICY community_replies_anon_select ON public.community_replies FOR SELECT TO anon USING (approved = true);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'activity_sources') THEN
    ALTER TABLE public.activity_sources ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='activity_sources' AND policyname='activity_sources_anon_select') THEN
      CREATE POLICY activity_sources_anon_select ON public.activity_sources FOR SELECT TO anon USING (true);
    END IF;
  END IF;

  -- ── 4. Realtime tables: anon SELECT required for postgres_changes events ────

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'leaderboard') THEN
    ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leaderboard' AND policyname='leaderboard_anon_select') THEN
      CREATE POLICY leaderboard_anon_select ON public.leaderboard FOR SELECT TO anon USING (true);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'session_attendance') THEN
    ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='session_attendance' AND policyname='session_attendance_anon_select') THEN
      CREATE POLICY session_attendance_anon_select ON public.session_attendance FOR SELECT TO anon USING (true);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'session_photos') THEN
    ALTER TABLE public.session_photos ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='session_photos' AND policyname='session_photos_anon_select') THEN
      CREATE POLICY session_photos_anon_select ON public.session_photos FOR SELECT TO anon USING (true);
    END IF;
  END IF;

  RAISE NOTICE 'RLS migration complete.';

END;
$$;
