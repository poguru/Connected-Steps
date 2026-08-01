-- Phase 4-6: Formally document the UNIQUE(session_id, user_email) constraint
-- on session_attendance that the application relies on for its upsert
-- (onConflict: 'session_id, user_email' in the session check-in path).
--
-- The constraint existed in the original database schema but was never recorded
-- in a migration file, making it a carry-forward risk — a freshly restored
-- database or a new environment would be missing it. CREATE UNIQUE INDEX IF
-- NOT EXISTS is idempotent: a no-op on production where the constraint already
-- exists, and a safety net on any environment where it was accidentally dropped.
--
-- This does NOT change any production behaviour.

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_attendance_session_user
  ON public.session_attendance (session_id, user_email);
