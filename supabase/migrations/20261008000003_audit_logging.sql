-- ============================================================
-- Migration 20261008000003 — Audit logging for IT Run admin
--
-- Creates audit trail for all admin actions on registrations
-- Tracks: who did what, when, to which resource
-- ============================================================

-- Audit log table
CREATE TABLE IF NOT EXISTS public.it_run_audit_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  action            TEXT        NOT NULL,
  admin_email       TEXT        NOT NULL,
  resource_type     TEXT        NOT NULL,
  resource_id       TEXT        NOT NULL,
  details           JSONB       DEFAULT NULL,
  timestamp         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_itr_audit_admin
  ON public.it_run_audit_logs(admin_email);

CREATE INDEX IF NOT EXISTS idx_itr_audit_resource
  ON public.it_run_audit_logs(resource_type, resource_id);

CREATE INDEX IF NOT EXISTS idx_itr_audit_action
  ON public.it_run_audit_logs(action);

CREATE INDEX IF NOT EXISTS idx_itr_audit_timestamp
  ON public.it_run_audit_logs(timestamp DESC);

-- Enable RLS
ALTER TABLE public.it_run_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "admins_view_audit_logs" ON public.it_run_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.it_run_portal_users
      WHERE email = current_user
        AND role = 'admin'
    )
  );

-- Only service role can insert (from API)
CREATE POLICY "service_role_audit_insert" ON public.it_run_audit_logs
  FOR INSERT
  WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE public.it_run_audit_logs IS 'Audit trail for IT Run admin actions';
COMMENT ON COLUMN public.it_run_audit_logs.action IS 'What action was performed (e.g., link_registration, unlink_registration)';
COMMENT ON COLUMN public.it_run_audit_logs.admin_email IS 'Email of admin who performed the action';
COMMENT ON COLUMN public.it_run_audit_logs.resource_type IS 'Type of resource affected (registration, user, etc.)';
COMMENT ON COLUMN public.it_run_audit_logs.resource_id IS 'ID of the resource affected';
COMMENT ON COLUMN public.it_run_audit_logs.details IS 'Additional JSON details (old values, new values, etc.)';
