-- Move Bill of Supply storage from DB column to Supabase Storage bucket.
-- invoice_html column is kept for backward compatibility (existing invoices).
-- New invoices store HTML in the 'bills-of-supply' bucket and set storage_path.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

CREATE INDEX IF NOT EXISTS invoices_storage_path_idx
  ON public.invoices (storage_path)
  WHERE storage_path IS NOT NULL;

-- Bucket creation is done via the Supabase dashboard or programmatically on first use.
-- Bucket name: bills-of-supply
-- Visibility:  PRIVATE (access only via service role key through our API)
