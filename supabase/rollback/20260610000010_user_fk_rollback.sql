-- ============================================================
-- ROLLBACK: User Foreign Key Relationships
-- Reverses: supabase/migrations/20260610000010_user_fk_relationships.sql
--
-- Run this in Supabase → SQL Editor to reverse the FK migration.
--
-- IMPORTANT: This only removes the constraints.
-- It does NOT restore any rows that were deleted as orphans
-- during the forward migration (those are permanently removed).
-- Restore from a pre-migration backup if row recovery is needed.
-- ============================================================

ALTER TABLE public.user_posts        DROP CONSTRAINT IF EXISTS user_posts_author_email_fk;
ALTER TABLE public.user_achievements DROP CONSTRAINT IF EXISTS user_achievements_user_email_fk;
ALTER TABLE public.referral_invites  DROP CONSTRAINT IF EXISTS referral_invites_referrer_fk;
ALTER TABLE public.referral_invites  DROP CONSTRAINT IF EXISTS referral_invites_invitee_fk;
ALTER TABLE public.referral_codes    DROP CONSTRAINT IF EXISTS referral_codes_user_email_fk;
ALTER TABLE public.leaderboard       DROP CONSTRAINT IF EXISTS leaderboard_user_email_fk;

DO $$
BEGIN
  RAISE NOTICE 'Rollback complete: all FK constraints from migration 20260610000010 have been dropped.';
END;
$$;
