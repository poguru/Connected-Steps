-- ============================================================
-- Connected Steps — Event Edit: new columns, audit log, storage
-- File: 20260725000004_event_edit.sql
-- ============================================================

-- ── New columns on events ─────────────────────────────────────────────────────

ALTER TABLE events ADD COLUMN IF NOT EXISTS short_description    TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS gallery_images       JSONB NOT NULL DEFAULT '[]';
ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_opens_at TIMESTAMPTZ;

-- ── Extend sponsor tiers for partner / organizer / powered-by logos ───────────

ALTER TABLE event_sponsors DROP CONSTRAINT IF EXISTS event_sponsors_tier_check;
ALTER TABLE event_sponsors ADD CONSTRAINT event_sponsors_tier_check
  CHECK (tier IN (
    'title','sports','refreshment','hydration','medical',
    'photography','community','support',
    'partner','organizer','powered_by'
  ));

-- ── Audit trail for event field changes ───────────────────────────────────────
-- All reads/writes go through the service-role API route (bypasses RLS).
-- No authenticated-user policies needed here.

CREATE TABLE IF NOT EXISTS event_change_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  changed_by TEXT        NOT NULL DEFAULT 'admin',
  field_name TEXT        NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  reason     TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE event_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ecl_service_all" ON event_change_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_event_change_log_event_id
  ON event_change_log (event_id, changed_at DESC);

-- ── Storage bucket for event media ────────────────────────────────────────────
-- Stores poster, banner, gallery images, and sponsor logos.
-- All uploads go through the service-role API route (bypasses RLS on write).
-- Only a public SELECT policy is required so CDN URLs resolve for everyone.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-media',
  'event-media',
  true,
  10485760,   -- 10 MB per file
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'event_media_public_read'
  ) THEN
    CREATE POLICY event_media_public_read ON storage.objects
      FOR SELECT USING (bucket_id = 'event-media');
  END IF;
END;
$$;
