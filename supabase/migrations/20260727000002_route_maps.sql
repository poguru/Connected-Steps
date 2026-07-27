-- Phase 2: Route Map Management
-- Replaces the single route_map_url column with a full multi-map table.
-- Supports images, PDFs, and GPX files, optionally per race category.
-- The original route_map_url column is kept for backward compatibility.

CREATE TABLE IF NOT EXISTS public.event_route_maps (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID         NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  race_id        UUID         REFERENCES public.event_races(id) ON DELETE SET NULL,
  name           TEXT         NOT NULL,
  file_url       TEXT         NOT NULL,
  file_type      TEXT         NOT NULL CHECK (file_type IN ('image', 'pdf', 'gpx')),
  file_size      BIGINT,
  version        SMALLINT     NOT NULL DEFAULT 1,
  is_active      BOOLEAN      NOT NULL DEFAULT true,
  display_order  SMALLINT     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_route_maps_event_idx
  ON public.event_route_maps (event_id, display_order);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.event_route_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "route_maps_service_all"
  ON public.event_route_maps FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "route_maps_admins_manage"
  ON public.event_route_maps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE email = auth.email()
      AND role IN ('admin', 'coach')
    )
  );

CREATE POLICY "route_maps_public_read_active"
  ON public.event_route_maps FOR SELECT
  USING (is_active = true);
