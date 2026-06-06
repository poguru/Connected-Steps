-- ── Coach role migration ─────────────────────────────────────────────────────
-- Run in Supabase SQL Editor > New Query

-- 1. Add role column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

-- 2. Mark existing coach accounts as coaches
--    (run AFTER creating their user accounts via /auth/register or INSERT)
UPDATE users
SET role = 'coach'
WHERE email IN (
  'ashokan@connectedsteps.in',
  'durga@connectedsteps.in',
  'achyuta@connectedsteps.in'
);

-- 3. Verify
SELECT email, role FROM users WHERE role = 'coach';
