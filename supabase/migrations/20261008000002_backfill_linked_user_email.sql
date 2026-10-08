-- ============================================================
-- Migration 20261008000002 — Backfill linked_user_email
--
-- Links existing IT Run registrations to Connected Steps accounts
-- using safe email-based matching.
--
-- Strategy:
-- 1. Match: registration lead_email (lowercase) → users.email
-- 2. Verify: only unambiguous 1:1 matches
-- 3. Report: orphaned, ambiguous, and successfully linked
--
-- Backfill is safe because:
-- - linked_user_email column already exists (nullable)
-- - FK constraint: email -> users(email)
-- - Index ensures fast lookups after backfill
-- - Does NOT break existing registrations
-- ============================================================

-- Step 1: Report on current state BEFORE backfill
DO $$
DECLARE
  v_unlinked_count INT;
  v_total_count INT;
BEGIN
  SELECT COUNT(*) INTO v_total_count FROM public.it_run_registrations;
  SELECT COUNT(*) INTO v_unlinked_count FROM public.it_run_registrations WHERE linked_user_email IS NULL;

  RAISE NOTICE 'Backfill Report - BEFORE:';
  RAISE NOTICE '  Total registrations: %', v_total_count;
  RAISE NOTICE '  Unlinked registrations: %', v_unlinked_count;
  RAISE NOTICE '  Already linked: %', (v_total_count - v_unlinked_count);
END $$;

-- Step 2: Create a temporary table to track matching results
CREATE TEMP TABLE temp_backfill_report (
  registration_id UUID,
  lead_email TEXT,
  user_email TEXT,
  match_type TEXT,
  reason TEXT
);

-- Step 3: Backfill by email matching
-- For each unlinked registration:
--   1. Try to find exact user match by lead_email
--   2. Only link if exactly one user found (unambiguous)
--   3. Log all matches and misses
DO $$
DECLARE
  v_reg RECORD;
  v_user_email TEXT;
  v_user_count INT;
  v_linked_count INT := 0;
  v_ambiguous_count INT := 0;
  v_orphaned_count INT := 0;
BEGIN
  FOR v_reg IN
    SELECT id, lead_email
    FROM public.it_run_registrations
    WHERE linked_user_email IS NULL
      AND lead_email IS NOT NULL
      AND lead_email != ''
  LOOP
    -- Normalize email (lowercase)
    v_user_email := LOWER(TRIM(v_reg.lead_email));

    -- Check if exactly one user matches this email
    SELECT COUNT(*) INTO v_user_count
    FROM public.users
    WHERE LOWER(email) = v_user_email;

    IF v_user_count = 1 THEN
      -- Exact match found: link the registration
      UPDATE public.it_run_registrations
      SET linked_user_email = v_user_email
      WHERE id = v_reg.id;

      INSERT INTO temp_backfill_report
      VALUES (v_reg.id, v_reg.lead_email, v_user_email, 'linked', 'Email matched to single user');

      v_linked_count := v_linked_count + 1;
    ELSIF v_user_count > 1 THEN
      -- Ambiguous: multiple users with same email (should not happen, but safety check)
      INSERT INTO temp_backfill_report
      VALUES (v_reg.id, v_reg.lead_email, NULL, 'ambiguous', 'Multiple users with this email');

      v_ambiguous_count := v_ambiguous_count + 1;
    ELSE
      -- No user found: registration remains orphaned
      INSERT INTO temp_backfill_report
      VALUES (v_reg.id, v_reg.lead_email, NULL, 'orphaned', 'No matching user account');

      v_orphaned_count := v_orphaned_count + 1;
    END IF;
  END LOOP;

  -- Report results
  RAISE NOTICE 'Backfill Report - AFTER:';
  RAISE NOTICE '  Successfully linked: %', v_linked_count;
  RAISE NOTICE '  Ambiguous (not linked): %', v_ambiguous_count;
  RAISE NOTICE '  Orphaned (not linked): %', v_orphaned_count;
  RAISE NOTICE 'Total processed: %', (v_linked_count + v_ambiguous_count + v_orphaned_count);
END $$;

-- Step 4: Log results for debugging/audit
-- These queries can be run manually to inspect results:
-- SELECT * FROM temp_backfill_report WHERE match_type = 'linked' LIMIT 10;
-- SELECT * FROM temp_backfill_report WHERE match_type = 'orphaned' LIMIT 10;
-- SELECT * FROM temp_backfill_report WHERE match_type = 'ambiguous' LIMIT 10;

-- Step 5: Verify FK constraint is satisfied
-- (All linked_user_email values should now exist in users.email)
DO $$
DECLARE
  v_invalid_count INT;
BEGIN
  SELECT COUNT(*) INTO v_invalid_count
  FROM public.it_run_registrations r
  WHERE r.linked_user_email IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE LOWER(u.email) = LOWER(r.linked_user_email)
    );

  IF v_invalid_count > 0 THEN
    RAISE WARNING 'Found % registrations with invalid linked_user_email', v_invalid_count;
  ELSE
    RAISE NOTICE 'All linked_user_email values are valid ✓';
  END IF;
END $$;

-- Step 6: Final statistics
DO $$
DECLARE
  v_now_linked INT;
  v_still_orphaned INT;
  v_total INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.it_run_registrations;
  SELECT COUNT(*) INTO v_now_linked FROM public.it_run_registrations WHERE linked_user_email IS NOT NULL;
  SELECT COUNT(*) INTO v_still_orphaned FROM public.it_run_registrations WHERE linked_user_email IS NULL;

  RAISE NOTICE '';
  RAISE NOTICE '===== FINAL STATE =====';
  RAISE NOTICE 'Total registrations: %', v_total;
  RAISE NOTICE 'Linked to users: % (%.1f%%)', v_now_linked, (v_now_linked::FLOAT / v_total * 100);
  RAISE NOTICE 'Orphaned (unlinked): % (%.1f%%)', v_still_orphaned, (v_still_orphaned::FLOAT / v_total * 100);
  RAISE NOTICE '=======================';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Review orphaned registrations (use query below)';
  RAISE NOTICE '2. Use admin tool to manually link ambiguous cases';
  RAISE NOTICE '3. Notify users of new "My Registrations" feature';
  RAISE NOTICE '';
  RAISE NOTICE 'Query to find orphaned registrations:';
  RAISE NOTICE 'SELECT id, registration_code, lead_email, created_at FROM it_run_registrations WHERE linked_user_email IS NULL ORDER BY created_at DESC;';
END $$;

-- Note: temp_backfill_report is automatically dropped at end of transaction
