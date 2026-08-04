-- Fix: event_types and event_categories RLS policies were missing a TO clause,
-- which in PostgreSQL means they apply to PUBLIC (including the anon role).
-- Any holder of the public anon key could INSERT/UPDATE/DELETE master table rows.

-- Drop the overly-permissive policies
DROP POLICY IF EXISTS "admin_all_event_types"       ON public.event_types;
DROP POLICY IF EXISTS "admin_all_event_categories"  ON public.event_categories;

-- service_role only for mutations (all API routes use service_role)
CREATE POLICY "service_role_all_event_types"
  ON public.event_types FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_event_categories"
  ON public.event_categories FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- anon and authenticated can read active rows (needed for public event pages)
CREATE POLICY "public_read_event_types"
  ON public.event_types FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "public_read_event_categories"
  ON public.event_categories FOR SELECT TO anon, authenticated
  USING (is_active = true);
