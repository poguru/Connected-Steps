-- ============================================================
-- Connected Steps — User Foreign Key Relationships
-- File: 20260610000010_user_fk_relationships.sql
-- Date: 2026-06-11
--
-- Adds proper FK constraints from user-owned tables to users(email).
--
-- Tables altered:
--   user_posts        author_email   → users(email)  ON DELETE CASCADE
--   user_achievements user_email     → users(email)  ON DELETE CASCADE
--   referral_invites  referrer_email → users(email)  ON DELETE CASCADE
--   referral_invites  invitee_email  → users(email)  ON DELETE SET NULL
--   referral_codes    user_email     → users(email)  ON DELETE CASCADE
--   leaderboard       user_email     → users(email)  ON DELETE CASCADE
--
-- Leaderboard decision: CASCADE
--   The leaderboard is a live rankings table. A row with no user identity
--   is meaningless and would corrupt the display. Historical data lives in
--   monthly_leaderboard_archive, not the live table.
--
-- Safety strategy:
--   1. Audit orphan counts (logged via RAISE NOTICE — never fails).
--   2. Delete confirmed orphans so existing rows satisfy the new FK.
--   3. Add each constraint with NOT VALID (skips a full table scan,
--      avoids a long ACCESS EXCLUSIVE lock on large tables).
--   4. Validate each constraint (SHARE UPDATE EXCLUSIVE — concurrent
--      reads and writes are unaffected during this phase).
--   5. Post-migration orphan check to confirm 0 orphans remain.
--
-- Idempotent: each ADD CONSTRAINT is guarded with an existence check,
-- so the script can be re-run safely.
--
-- To roll back: run supabase/rollback/20260610000010_user_fk_rollback.sql
-- ============================================================

-- ── Phase 0 + Phase 1 + Phase 2: pre-flight, audit, cleanup ─────────────────
DO $$
DECLARE
  v_count BIGINT;
BEGIN

  -- 0. Confirm users(email) has a UNIQUE or PRIMARY KEY constraint.
  --    FKs require the referenced column to be unique.
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint c
    JOIN   pg_class      t ON t.oid = c.conrelid
    JOIN   pg_namespace  n ON n.oid = t.relnamespace
    JOIN   pg_attribute  a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
    WHERE  n.nspname  = 'public'
      AND  t.relname  = 'users'
      AND  a.attname  = 'email'
      AND  c.contype IN ('p', 'u')
  ) THEN
    RAISE EXCEPTION
      'users.email does not have a UNIQUE or PRIMARY KEY constraint. '
      'Add one before running this migration.';
  END IF;

  -- 1. Orphan audit — logged so the operator sees what will be removed.

  SELECT COUNT(*) INTO v_count FROM user_posts
  WHERE author_email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users WHERE email = user_posts.author_email);
  RAISE NOTICE '[fk-migration] user_posts orphans: %', v_count;

  SELECT COUNT(*) INTO v_count FROM user_achievements
  WHERE user_email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users WHERE email = user_achievements.user_email);
  RAISE NOTICE '[fk-migration] user_achievements orphans: %', v_count;

  SELECT COUNT(*) INTO v_count FROM referral_invites
  WHERE referrer_email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users WHERE email = referral_invites.referrer_email);
  RAISE NOTICE '[fk-migration] referral_invites (referrer) orphans: %', v_count;

  SELECT COUNT(*) INTO v_count FROM referral_invites
  WHERE invitee_email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users WHERE email = referral_invites.invitee_email);
  RAISE NOTICE '[fk-migration] referral_invites (invitee) orphans: %', v_count;

  SELECT COUNT(*) INTO v_count FROM referral_codes
  WHERE user_email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users WHERE email = referral_codes.user_email);
  RAISE NOTICE '[fk-migration] referral_codes orphans: %', v_count;

  SELECT COUNT(*) INTO v_count FROM leaderboard
  WHERE user_email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users WHERE email = leaderboard.user_email);
  RAISE NOTICE '[fk-migration] leaderboard orphans: %', v_count;

  -- 2. Orphan cleanup.

  DELETE FROM user_posts
  WHERE author_email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users WHERE email = user_posts.author_email);

  DELETE FROM user_achievements
  WHERE user_email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users WHERE email = user_achievements.user_email);

  -- NULL out orphaned invitee first (mirrors SET NULL FK behaviour),
  -- then delete rows whose referrer has no account.
  UPDATE referral_invites
  SET    invitee_email = NULL
  WHERE  invitee_email IS NOT NULL
    AND  NOT EXISTS (SELECT 1 FROM users WHERE email = referral_invites.invitee_email);

  DELETE FROM referral_invites
  WHERE referrer_email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users WHERE email = referral_invites.referrer_email);

  DELETE FROM referral_codes
  WHERE user_email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users WHERE email = referral_codes.user_email);

  DELETE FROM leaderboard
  WHERE user_email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users WHERE email = leaderboard.user_email);

  RAISE NOTICE '[fk-migration] Orphan cleanup complete.';
END;
$$;

-- ── Phase 3: add FK constraints (NOT VALID — fast, no full table scan) ───────
-- Each block checks pg_constraint so the script is safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_posts_author_email_fk' AND conrelid = 'public.user_posts'::regclass
  ) THEN
    ALTER TABLE public.user_posts
      ADD CONSTRAINT user_posts_author_email_fk
      FOREIGN KEY (author_email) REFERENCES public.users(email)
      ON DELETE CASCADE NOT VALID;
    RAISE NOTICE '[fk-migration] Added user_posts_author_email_fk';
  ELSE
    RAISE NOTICE '[fk-migration] user_posts_author_email_fk already exists — skipped';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_achievements_user_email_fk' AND conrelid = 'public.user_achievements'::regclass
  ) THEN
    ALTER TABLE public.user_achievements
      ADD CONSTRAINT user_achievements_user_email_fk
      FOREIGN KEY (user_email) REFERENCES public.users(email)
      ON DELETE CASCADE NOT VALID;
    RAISE NOTICE '[fk-migration] Added user_achievements_user_email_fk';
  ELSE
    RAISE NOTICE '[fk-migration] user_achievements_user_email_fk already exists — skipped';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'referral_invites_referrer_fk' AND conrelid = 'public.referral_invites'::regclass
  ) THEN
    ALTER TABLE public.referral_invites
      ADD CONSTRAINT referral_invites_referrer_fk
      FOREIGN KEY (referrer_email) REFERENCES public.users(email)
      ON DELETE CASCADE NOT VALID;
    RAISE NOTICE '[fk-migration] Added referral_invites_referrer_fk';
  ELSE
    RAISE NOTICE '[fk-migration] referral_invites_referrer_fk already exists — skipped';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'referral_invites_invitee_fk' AND conrelid = 'public.referral_invites'::regclass
  ) THEN
    ALTER TABLE public.referral_invites
      ADD CONSTRAINT referral_invites_invitee_fk
      FOREIGN KEY (invitee_email) REFERENCES public.users(email)
      ON DELETE SET NULL NOT VALID;
    RAISE NOTICE '[fk-migration] Added referral_invites_invitee_fk';
  ELSE
    RAISE NOTICE '[fk-migration] referral_invites_invitee_fk already exists — skipped';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'referral_codes_user_email_fk' AND conrelid = 'public.referral_codes'::regclass
  ) THEN
    ALTER TABLE public.referral_codes
      ADD CONSTRAINT referral_codes_user_email_fk
      FOREIGN KEY (user_email) REFERENCES public.users(email)
      ON DELETE CASCADE NOT VALID;
    RAISE NOTICE '[fk-migration] Added referral_codes_user_email_fk';
  ELSE
    RAISE NOTICE '[fk-migration] referral_codes_user_email_fk already exists — skipped';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leaderboard_user_email_fk' AND conrelid = 'public.leaderboard'::regclass
  ) THEN
    ALTER TABLE public.leaderboard
      ADD CONSTRAINT leaderboard_user_email_fk
      FOREIGN KEY (user_email) REFERENCES public.users(email)
      ON DELETE CASCADE NOT VALID;
    RAISE NOTICE '[fk-migration] Added leaderboard_user_email_fk';
  ELSE
    RAISE NOTICE '[fk-migration] leaderboard_user_email_fk already exists — skipped';
  END IF;
END;
$$;

-- ── Phase 4: validate (SHARE UPDATE EXCLUSIVE — reads unblocked) ─────────────

ALTER TABLE public.user_posts        VALIDATE CONSTRAINT user_posts_author_email_fk;
ALTER TABLE public.user_achievements VALIDATE CONSTRAINT user_achievements_user_email_fk;
ALTER TABLE public.referral_invites  VALIDATE CONSTRAINT referral_invites_referrer_fk;
ALTER TABLE public.referral_invites  VALIDATE CONSTRAINT referral_invites_invitee_fk;
ALTER TABLE public.referral_codes    VALIDATE CONSTRAINT referral_codes_user_email_fk;
ALTER TABLE public.leaderboard       VALIDATE CONSTRAINT leaderboard_user_email_fk;

-- ── Phase 5: post-migration orphan verification ───────────────────────────────

DO $$
DECLARE
  v_count BIGINT;
  v_total BIGINT := 0;
BEGIN
  SELECT COUNT(*) INTO v_count FROM user_posts
  WHERE author_email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users WHERE email = user_posts.author_email);
  v_total := v_total + v_count;
  IF v_count > 0 THEN RAISE WARNING '[fk-migration] POST: % orphan(s) in user_posts', v_count; END IF;

  SELECT COUNT(*) INTO v_count FROM user_achievements
  WHERE user_email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users WHERE email = user_achievements.user_email);
  v_total := v_total + v_count;
  IF v_count > 0 THEN RAISE WARNING '[fk-migration] POST: % orphan(s) in user_achievements', v_count; END IF;

  SELECT COUNT(*) INTO v_count FROM referral_invites
  WHERE referrer_email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users WHERE email = referral_invites.referrer_email);
  v_total := v_total + v_count;
  IF v_count > 0 THEN RAISE WARNING '[fk-migration] POST: % orphan(s) in referral_invites (referrer)', v_count; END IF;

  SELECT COUNT(*) INTO v_count FROM referral_invites
  WHERE invitee_email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users WHERE email = referral_invites.invitee_email);
  v_total := v_total + v_count;
  IF v_count > 0 THEN RAISE WARNING '[fk-migration] POST: % orphan(s) in referral_invites (invitee)', v_count; END IF;

  SELECT COUNT(*) INTO v_count FROM referral_codes
  WHERE user_email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users WHERE email = referral_codes.user_email);
  v_total := v_total + v_count;
  IF v_count > 0 THEN RAISE WARNING '[fk-migration] POST: % orphan(s) in referral_codes', v_count; END IF;

  SELECT COUNT(*) INTO v_count FROM leaderboard
  WHERE user_email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users WHERE email = leaderboard.user_email);
  v_total := v_total + v_count;
  IF v_count > 0 THEN RAISE WARNING '[fk-migration] POST: % orphan(s) in leaderboard', v_count; END IF;

  IF v_total = 0 THEN
    RAISE NOTICE '[fk-migration] POST-MIGRATION: all tables clean — 0 orphans remaining.';
  END IF;
END;
$$;
