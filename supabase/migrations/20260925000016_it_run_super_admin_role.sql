-- Migration 000016: Add super_admin role to it_run_portal_users
-- Super Admin has full access to all admin portal features.

ALTER TABLE public.it_run_portal_users
  DROP CONSTRAINT IF EXISTS it_run_portal_users_role_check;

ALTER TABLE public.it_run_portal_users
  ADD CONSTRAINT it_run_portal_users_role_check
  CHECK (role IN ('super_admin','event_admin','verification_team','bib_collection','checkin_team','support_desk'));
