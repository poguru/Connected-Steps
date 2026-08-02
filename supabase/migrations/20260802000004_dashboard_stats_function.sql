-- ============================================================
-- Connected Steps — Dashboard Statistics RPC
-- File: 20260802000004_dashboard_stats_function.sql
--
-- Creates a single server-side function that returns dashboard
-- aggregate counts which cannot be expressed as simple REST
-- queries (e.g. COUNT(DISTINCT ...)).
--
-- Called from /api/admin/dashboard as:
--   db.rpc("get_dashboard_stats")
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    -- Total confirmed registrations (one row per booking)
    'total_confirmed_registrations',
    (SELECT count(*) FROM public.event_registrations WHERE status = 'confirmed'),

    -- Total active participant slots (one per physical person, handles multi-participant bookings)
    'total_active_participants',
    (SELECT count(*) FROM public.event_participants WHERE status = 'active'),

    -- Unique CS account holders who have at least one active participant slot
    'unique_event_users',
    (SELECT count(DISTINCT account_email) FROM public.event_participants WHERE status = 'active'),

    -- Total registered app users (all rows, no filter)
    'total_app_users',
    (SELECT count(*) FROM public.users)
  );
$$;

-- Only service_role may call this function (matches all other API routes)
REVOKE ALL ON FUNCTION public.get_dashboard_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_stats() FROM anon;
REVOKE ALL ON FUNCTION public.get_dashboard_stats() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO service_role;
