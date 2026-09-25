-- Migration 000017: Add entity_type index on it_run_audit_logs
-- Supports the new entity_type filter in the audit log API.

CREATE INDEX IF NOT EXISTS it_run_audit_logs_entity_type_idx
  ON public.it_run_audit_logs (entity_type, created_at DESC);

CREATE INDEX IF NOT EXISTS it_run_audit_logs_entity_id_idx
  ON public.it_run_audit_logs (entity_id, created_at DESC);
