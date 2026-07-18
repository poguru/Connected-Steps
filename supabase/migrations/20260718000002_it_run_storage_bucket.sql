-- Storage bucket for IT Run company ID uploads
-- Bucket is private (public = false) — files are accessed via signed URLs or service role

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'it-run-company-ids',
  'it-run-company-ids',
  false,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Allow service role (API routes) to manage the bucket — RLS is bypassed for service role
-- No public policies needed since all access goes through API routes
