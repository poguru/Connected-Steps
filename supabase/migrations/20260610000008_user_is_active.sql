-- Add is_active flag to users table for account deactivation.
-- Existing rows default to true (no disruption to active users).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
