-- CRIT-8: RLS policies for event tables.
-- All three tables already have RLS enabled (deny-all by default).
-- This migration adds the minimum required policies:
--   events             → anon can SELECT published events only
--   event_rsvp         → no anon access (RLS with no policies = deny all)
--   event_registrations → no anon access (RLS with no policies = deny all)
-- All mutations and privileged reads go through /api/* routes using the
-- service-role key which bypasses RLS entirely.

-- ── events: allow anon to view published events ──────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'events'
      AND policyname = 'events_anon_select_published'
  ) THEN
    CREATE POLICY events_anon_select_published
      ON public.events
      FOR SELECT
      TO anon
      USING (status = 'published');
  END IF;
END;
$$;

-- ── event_rsvp: explicitly confirm deny-all (no policy needed — documented) ──
-- RLS is already enabled on event_rsvp with no policies → anon access denied.
-- No INSERT/UPDATE/DELETE policies: all writes go through service-role API routes.

-- ── event_registrations: same — no anon access ───────────────────────────────
-- RLS is already enabled on event_registrations with no policies → anon denied.
-- Personal registration data is returned only through authenticated API routes
-- that verify x-user-token before querying with the service-role key.
