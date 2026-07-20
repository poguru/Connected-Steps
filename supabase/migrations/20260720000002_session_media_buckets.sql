-- ============================================================
-- Connected Steps — Create session-photos and session-videos
--                   storage buckets required by MediaManager
-- File: 20260720000002_session_media_buckets.sql
-- ============================================================
-- The session_media table (20260701000001) uploads files to
-- these two buckets but the buckets were never provisioned.
-- Both are public so their URLs work without signed tokens.
-- Uploads go through the service-role API route (RLS bypassed).
-- ============================================================

-- Public image bucket (JPEG, PNG, WEBP, GIF — 100 MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'session-photos',
  'session-photos',
  true,
  104857600,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Public video bucket (MP4, MOV/QuickTime, WEBM — 100 MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'session-videos',
  'session-videos',
  true,
  104857600,
  ARRAY['video/mp4','video/quicktime','video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read objects in both buckets
-- (public = true on the bucket does NOT automatically add RLS policies;
--  we still need a SELECT policy on storage.objects)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'session_photos_public_read'
  ) THEN
    CREATE POLICY session_photos_public_read ON storage.objects
      FOR SELECT USING (bucket_id = 'session-photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'session_videos_public_read'
  ) THEN
    CREATE POLICY session_videos_public_read ON storage.objects
      FOR SELECT USING (bucket_id = 'session-videos');
  END IF;
END;
$$;
