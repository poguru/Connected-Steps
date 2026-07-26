-- Phase 0 / Phase 1: Event landing page additions.
-- Adds columns needed for the premium event page redesign.
-- All additions are nullable with no default — fully backward compatible.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS whatsapp_community_url  text,
  ADD COLUMN IF NOT EXISTS route_map_url           text,
  ADD COLUMN IF NOT EXISTS route_map_type          text; -- 'image' | 'pdf'

COMMENT ON COLUMN public.events.whatsapp_community_url IS 'Optional WhatsApp community/group link shown on event page, confirmation email, and user dashboard.';
COMMENT ON COLUMN public.events.route_map_url IS 'Supabase Storage URL for the route map image or PDF.';
COMMENT ON COLUMN public.events.route_map_type IS 'File type of route_map_url: image or pdf.';
