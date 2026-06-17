-- ============================================================
-- Connected Steps — Test Data Cleanup
-- Run these queries in Supabase SQL Editor.
-- REVIEW each SELECT before running the DELETE.
-- ============================================================

-- ── 1. PREVIEW: Community posts that look like test data ────
SELECT id, user_name, user_email, title, body, created_at
FROM community_posts
WHERE
  lower(user_name)  LIKE '%test%'
  OR lower(user_email) LIKE '%test%'
  OR lower(title)   LIKE '%test%'
  OR lower(body)    LIKE '%xss%'
  OR lower(body)    LIKE '%<script%'
  OR lower(body)    LIKE '%alert(%'
ORDER BY created_at DESC;

-- ── 2. DELETE: Community posts identified above ─────────────
-- Uncomment only after reviewing the SELECT above.
/*
DELETE FROM community_posts
WHERE
  lower(user_name)  LIKE '%test%'
  OR lower(user_email) LIKE '%test%'
  OR lower(title)   LIKE '%test%'
  OR lower(body)    LIKE '%xss%'
  OR lower(body)    LIKE '%<script%'
  OR lower(body)    LIKE '%alert(%';
*/

-- ── 3. PREVIEW: Stories that look like test data ────────────
SELECT id, user_name, user_email, quote, achievement, created_at
FROM stories
WHERE
  lower(user_name)  LIKE '%test%'
  OR lower(user_email) LIKE '%test%'
  OR lower(quote)   LIKE '%test%'
ORDER BY created_at DESC;

-- ── 4. DELETE: Stories identified above ─────────────────────
/*
DELETE FROM stories
WHERE
  lower(user_name)  LIKE '%test%'
  OR lower(user_email) LIKE '%test%'
  OR lower(quote)   LIKE '%test%';
*/

-- ── 5. PREVIEW: Test user accounts ──────────────────────────
SELECT email, first_name, last_name, created_at, is_active
FROM users
WHERE
  lower(email) LIKE '%test%'
  OR lower(email) LIKE '%dummy%'
  OR lower(email) LIKE '%qa+%'
  OR lower(first_name) LIKE '%test%'
ORDER BY created_at DESC;

-- ── 6. DELETE: Test user accounts ───────────────────────────
-- WARNING: This also cascades to related rows if FK constraints
-- are set to ON DELETE CASCADE. Verify before running.
/*
DELETE FROM users
WHERE
  lower(email) LIKE '%test%'
  OR lower(email) LIKE '%dummy%'
  OR lower(email) LIKE '%qa+%'
  AND lower(first_name) LIKE '%test%';
*/

-- ── 7. PREVIEW: Coach questions marked as test/dummy ────────
SELECT id, user_email, question, category, created_at
FROM coach_questions
WHERE
  lower(user_email) LIKE '%test%'
  OR lower(question) LIKE '%test question%'
  OR lower(question) LIKE '%dummy%'
ORDER BY created_at DESC;

-- ── 8. Reset birthday sent dates (if you want to re-send) ───
-- Only run if you need to reset the birthday cron dedup.
/*
UPDATE users
SET birthday_email_sent = NULL,
    birthday_wa_sent    = NULL
WHERE birthday_email_sent IS NOT NULL
   OR birthday_wa_sent    IS NOT NULL;
*/
