-- Fix: event_ops migration referenced non-existent public.admin_users table.
-- All API routes use service_role (bypasses RLS), so the authenticated-role
-- policies are unnecessary. Guard with IF EXISTS so this is safe to run even
-- when the tables were never created (e.g. fresh installs where the original
-- migration was patched before first run).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'event_checkpoints') THEN
    DROP POLICY IF EXISTS "admins_manage_checkpoints" ON public.event_checkpoints;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'event_incidents') THEN
    DROP POLICY IF EXISTS "admins_manage_incidents" ON public.event_incidents;
  END IF;
END;
$$;
