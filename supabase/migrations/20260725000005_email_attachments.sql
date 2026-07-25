-- ============================================================
-- Connected Steps — Email Attachments: storage + queue columns
-- File: 20260725000005_email_attachments.sql
-- ============================================================

-- ── Attachment metadata columns ───────────────────────────────────────────────
-- Stored as JSONB array: [{ name, mime_type, size, path }]
-- Defaults to [] so all existing rows remain fully functional.

ALTER TABLE email_queue
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]';

ALTER TABLE event_comm_history
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]';

-- ── Private storage bucket for email attachments ──────────────────────────────
-- Private (not publicly accessible) — files are downloaded server-side via
-- the service role key, base64-encoded, and sent inline with ZeptoMail.
-- Supports images and PDFs; 5 MB per file.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-attachments',
  'email-attachments',
  false,
  5242880,
  ARRAY[
    'image/jpeg','image/jpg','image/png','image/webp','image/svg+xml',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- service_role policy (all reads/writes from API routes use service role)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'email_attachments_service_all'
  ) THEN
    CREATE POLICY email_attachments_service_all ON storage.objects
      FOR ALL TO service_role
      USING  (bucket_id = 'email-attachments')
      WITH CHECK (bucket_id = 'email-attachments');
  END IF;
END;
$$;
