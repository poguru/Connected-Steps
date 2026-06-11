-- Add is_active column to users table for account deactivation support.
-- Safe to run multiple times (IF NOT EXISTS guards).
-- Apply this in Supabase Dashboard → SQL Editor if supabase db push is not available.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_users_is_active
  ON public.users (is_active)
  WHERE is_active = false;
