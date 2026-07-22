-- Add title, severity, and multi-attachment support to bug_reports.
--
-- attachments: JSONB array of {path, type, name, size} objects.
-- type = 'image' for screenshots; can hold 'video' later with no schema change.
-- screenshot_url kept for backward-compat with older reports.

ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS title       TEXT,
  ADD COLUMN IF NOT EXISTS severity    TEXT,
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
