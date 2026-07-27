-- Communication Templates v2
-- Adds status lifecycle (draft/active/archived) and description to comm_templates.
-- Fully additive — no existing columns or constraints are changed.

ALTER TABLE public.comm_templates
  ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Backfill existing rows to 'active' (already the default, but be explicit)
UPDATE public.comm_templates SET status = 'active' WHERE status IS NULL OR status = '';

-- Index for fast filter by status
CREATE INDEX IF NOT EXISTS comm_templates_status_idx ON public.comm_templates (status, created_at DESC);
