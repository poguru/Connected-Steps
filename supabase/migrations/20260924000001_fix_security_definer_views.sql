-- Fix SECURITY DEFINER warnings on media views.
--
-- PostgreSQL 15 requires an explicit SECURITY INVOKER clause on views to
-- prevent them from running as the view owner (which bypasses RLS).
-- All three views are read-only aggregates accessed only via the service
-- role, so INVOKER is correct and safe.

ALTER VIEW public.session_cover_media  SET (security_invoker = true);
ALTER VIEW public.media_cleanup_queue  SET (security_invoker = true);
ALTER VIEW public.media_storage_stats  SET (security_invoker = true);
