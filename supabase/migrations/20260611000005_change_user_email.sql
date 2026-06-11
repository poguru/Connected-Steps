-- ============================================================
-- Connected Steps — Email change support
-- File: 20260611000005_change_user_email.sql
-- Date: 2026-06-11
--
-- Two things:
--
-- 1. Re-creates the six FK constraints added in migration 10 with
--    ON UPDATE CASCADE so that changing users.email automatically
--    propagates to all FK-referenced child tables in one statement.
--
-- 2. Creates the change_user_email(old, new) function which updates
--    the remaining tables that have no FK (session_attendance,
--    memberships, notifications, follows, etc.) and then updates
--    users.email, triggering the CASCADE on the FK tables.
--
-- Safe to re-run: DROP CONSTRAINT IF EXISTS guards each drop.
-- ============================================================

-- ── 1. Re-create FK constraints with ON UPDATE CASCADE ─────────────────────

ALTER TABLE public.user_posts
  DROP CONSTRAINT IF EXISTS user_posts_author_email_fk;
ALTER TABLE public.user_posts
  ADD CONSTRAINT user_posts_author_email_fk
  FOREIGN KEY (author_email) REFERENCES public.users(email)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.user_achievements
  DROP CONSTRAINT IF EXISTS user_achievements_user_email_fk;
ALTER TABLE public.user_achievements
  ADD CONSTRAINT user_achievements_user_email_fk
  FOREIGN KEY (user_email) REFERENCES public.users(email)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.referral_invites
  DROP CONSTRAINT IF EXISTS referral_invites_referrer_fk;
ALTER TABLE public.referral_invites
  ADD CONSTRAINT referral_invites_referrer_fk
  FOREIGN KEY (referrer_email) REFERENCES public.users(email)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.referral_invites
  DROP CONSTRAINT IF EXISTS referral_invites_invitee_fk;
ALTER TABLE public.referral_invites
  ADD CONSTRAINT referral_invites_invitee_fk
  FOREIGN KEY (invitee_email) REFERENCES public.users(email)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public.referral_codes
  DROP CONSTRAINT IF EXISTS referral_codes_user_email_fk;
ALTER TABLE public.referral_codes
  ADD CONSTRAINT referral_codes_user_email_fk
  FOREIGN KEY (user_email) REFERENCES public.users(email)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.leaderboard
  DROP CONSTRAINT IF EXISTS leaderboard_user_email_fk;
ALTER TABLE public.leaderboard
  ADD CONSTRAINT leaderboard_user_email_fk
  FOREIGN KEY (user_email) REFERENCES public.users(email)
  ON DELETE CASCADE ON UPDATE CASCADE;


-- ── 2. change_user_email function ──────────────────────────────────────────
--
-- Updates every table that stores an email address in a single transaction:
--   • Tables WITHOUT FK constraints → updated explicitly below
--   • Tables WITH FK constraints    → cascade automatically when users.email
--                                     is updated at the end
--
-- The function is SECURITY DEFINER so it runs with sufficient privileges
-- to update all tables regardless of RLS policies.

CREATE OR REPLACE FUNCTION change_user_email(p_old_email text, p_new_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Normalise to lower-case for consistency
  p_old_email := LOWER(p_old_email);
  p_new_email := LOWER(p_new_email);

  IF p_old_email = p_new_email THEN
    RAISE EXCEPTION 'Old and new email are the same';
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE email = p_new_email) THEN
    RAISE EXCEPTION 'Email % is already in use', p_new_email;
  END IF;

  -- ── Tables without FK constraints on users.email ──────────────────────────
  -- (these must be updated before users.email changes)

  UPDATE session_attendance SET user_email      = p_new_email WHERE user_email      = p_old_email;
  UPDATE memberships         SET user_email      = p_new_email WHERE user_email      = p_old_email;
  UPDATE notifications       SET user_email      = p_new_email WHERE user_email      = p_old_email;
  UPDATE follows             SET follower_email  = p_new_email WHERE follower_email  = p_old_email;
  UPDATE follows             SET following_email = p_new_email WHERE following_email = p_old_email;
  UPDATE coupon_uses         SET used_by_email   = p_new_email WHERE used_by_email   = p_old_email;
  UPDATE run_registrations   SET email           = p_new_email WHERE email           = p_old_email;

  -- Update these tables only if they exist (optional integrations)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'push_subscriptions') THEN
    EXECUTE 'UPDATE push_subscriptions SET user_email = $1 WHERE user_email = $2' USING p_new_email, p_old_email;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'push_tokens') THEN
    EXECUTE 'UPDATE push_tokens SET user_email = $1 WHERE user_email = $2' USING p_new_email, p_old_email;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'synced_activities') THEN
    EXECUTE 'UPDATE synced_activities SET user_email = $1 WHERE user_email = $2' USING p_new_email, p_old_email;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_integrations') THEN
    EXECUTE 'UPDATE user_integrations SET user_email = $1 WHERE user_email = $2' USING p_new_email, p_old_email;
  END IF;

  -- ── Update parent table — ON UPDATE CASCADE propagates to FK children ─────
  UPDATE users SET email = p_new_email WHERE email = p_old_email;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User with email % not found', p_old_email;
  END IF;
END;
$$;
