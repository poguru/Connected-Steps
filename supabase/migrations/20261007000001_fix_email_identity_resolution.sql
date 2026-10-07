/**
 * CRITICAL FIX: Email Identity Resolution in Event Registration
 * Date: 2026-10-07
 *
 * ISSUE: Existing Connected Steps users are incorrectly sent to account creation
 * during IT Run registration, even though their account exists.
 *
 * ROOT CAUSE:
 * - The user lookup in /api/auth/complete-event-verify uses .eq() which is
 *   case-sensitive in PostgreSQL by default
 * - If account email is stored differently (e.g. "Kalyan@gmail.com" vs "kalyan@gmail.com"),
 *   the lookup fails
 * - Backend then returns needs_profile:true, showing account creation form
 * - When user enters mobile from existing account, system detects mobile collision
 *
 * SOLUTION:
 * 1. Ensure email column has a UNIQUE constraint that is CASE-INSENSITIVE
 * 2. Normalize all emails to lowercase when stored (already done in app code)
 * 3. Add comprehensive logging for identity resolution failures
 */

-- No schema changes needed — application code will handle case-insensitive lookup
-- via .ilike() instead of .eq()

-- Verify that all emails in the users table are lowercase (data validation)
-- This query should return 0 rows if all emails are normalized. If results appear,
-- manually run: UPDATE public.users SET email = LOWER(email) WHERE email != LOWER(email);
--
-- SELECT
--   COUNT(*) as non_normalized_emails,
--   STRING_AGG(DISTINCT email, ', ') as examples
-- FROM public.users
-- WHERE email != LOWER(email);
