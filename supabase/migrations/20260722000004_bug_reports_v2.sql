-- ── Bug Reports v2: reporter tracking, status lifecycle, history audit trail ───

-- 1. New columns on bug_reports
ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS user_id          UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS os               TEXT,
  ADD COLUMN IF NOT EXISTS membership_type  TEXT,
  ADD COLUMN IF NOT EXISTS resolution_summary TEXT,
  ADD COLUMN IF NOT EXISTS version_fixed    TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes   TEXT;

-- 2. Migrate old status values to new lifecycle
UPDATE public.bug_reports SET status = 'new'          WHERE status = 'open';
UPDATE public.bug_reports SET status = 'acknowledged' WHERE status = 'investigating';
UPDATE public.bug_reports SET status = 'resolved'     WHERE status IN ('fixed', 'released');
-- 'closed' stays as 'closed'

-- 3. Replace status check constraint
ALTER TABLE public.bug_reports DROP CONSTRAINT IF EXISTS bug_reports_status_check;
ALTER TABLE public.bug_reports ADD CONSTRAINT bug_reports_status_check
  CHECK (status IN ('new', 'acknowledged', 'in_progress', 'testing', 'resolved', 'closed'));

ALTER TABLE public.bug_reports ALTER COLUMN status SET DEFAULT 'new';

-- 4. History / audit table
CREATE TABLE IF NOT EXISTS public.bug_report_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_report_id UUID        NOT NULL REFERENCES public.bug_reports(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL,
  changed_by    TEXT        NOT NULL,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  comment       TEXT
);

CREATE INDEX IF NOT EXISTS bug_report_history_report_idx
  ON public.bug_report_history (bug_report_id, changed_at DESC);

ALTER TABLE public.bug_report_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bug_report_history_service_role" ON public.bug_report_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. Seed initial history rows for existing reports (treat as already-created events)
INSERT INTO public.bug_report_history (bug_report_id, status, changed_by, changed_at, comment)
SELECT id, status, 'system', created_at, 'Migrated from legacy status'
FROM public.bug_reports
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
