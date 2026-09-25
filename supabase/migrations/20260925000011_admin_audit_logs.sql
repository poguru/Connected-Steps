-- ============================================================
-- Migration 20260925000011 — IT Run Admin audit log
--
-- it_run_audit_logs records every write action performed through
-- the Event Admin Portal. Reads are never logged.
-- Written by API routes non-fatally — a log failure must never
-- block the primary operation.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.it_run_audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID        REFERENCES public.it_run_events(id) ON DELETE SET NULL,
  actor_email TEXT        NOT NULL,
  actor_role  TEXT        NOT NULL,
  action      TEXT        NOT NULL,     -- e.g. 'update_event', 'create_staff', 'resend_email'
  entity_type TEXT,                     -- e.g. 'event', 'category', 'registration', 'staff'
  entity_id   TEXT,                     -- UUID or code of the affected row
  detail      JSONB,                    -- updated field names, diff summary, etc.
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS it_run_audit_logs_event_id_idx    ON public.it_run_audit_logs (event_id);
CREATE INDEX IF NOT EXISTS it_run_audit_logs_created_at_idx  ON public.it_run_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS it_run_audit_logs_actor_email_idx ON public.it_run_audit_logs (actor_email);
CREATE INDEX IF NOT EXISTS it_run_audit_logs_action_idx      ON public.it_run_audit_logs (action);

ALTER TABLE public.it_run_audit_logs ENABLE ROW LEVEL SECURITY;
-- Service role bypasses RLS. No anon/authenticated access.
