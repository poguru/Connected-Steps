-- ============================================================
-- Connected Steps — Admin Cancellation & Refund Management
-- File: 20260725000001_cancellation_refund.sql
--
-- Safe additive changes:
--   • ADD COLUMN IF NOT EXISTS (no drops/renames)
--   • New tables: cancellation_requests, cancellation_audit_log
--   • Adds refund_policy_config JSONB to events
--     (refund_policy TEXT already exists — different column)
-- ============================================================


-- ── 1. Cancellation / refund columns on event_registrations ──────────────────

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS cancelled_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by             TEXT,          -- admin email / "admin"
  ADD COLUMN IF NOT EXISTS cancellation_reason      TEXT,

  ADD COLUMN IF NOT EXISTS refund_status            TEXT
    CHECK (refund_status IN ('not_applicable','pending','processing','processed','failed')),
  ADD COLUMN IF NOT EXISTS refund_amount            INTEGER,       -- paise (cents)
  ADD COLUMN IF NOT EXISTS refund_id                TEXT,          -- rzp_xxx from Razorpay
  ADD COLUMN IF NOT EXISTS refunded_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_failure_reason    TEXT,
  ADD COLUMN IF NOT EXISTS refund_requested_by      TEXT,          -- "admin" who triggered
  ADD COLUMN IF NOT EXISTS refund_requested_at      TIMESTAMPTZ;

-- Fast lookup for reporting
CREATE INDEX IF NOT EXISTS event_reg_refund_status_idx
  ON public.event_registrations (event_id, refund_status)
  WHERE refund_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_reg_cancelled_at_idx
  ON public.event_registrations (event_id, cancelled_at)
  WHERE cancelled_at IS NOT NULL;


-- ── 2. Structured refund policy config on events ──────────────────────────────
-- refund_policy TEXT already exists (human-readable); this is machine-readable.
-- Schema: { enabled: bool, rules: [{days_before: int, refund_pct: int}], contact_email: str, contact_phone: str }

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS refund_policy_config JSONB;


-- ── 3. cancellation_requests ──────────────────────────────────────────────────
-- Users submit cancellation requests; admins review and act on them.
-- Users NEVER directly cancel — only admins do via the cancel API.

CREATE TABLE IF NOT EXISTS public.cancellation_requests (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id     UUID        NOT NULL REFERENCES public.event_registrations(id) ON DELETE CASCADE,
  event_id            UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_email          TEXT        NOT NULL,
  user_name           TEXT        NOT NULL,
  reason              TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled')),
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at         TIMESTAMPTZ,
  reviewed_by         TEXT,
  review_note         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cancel_req_registration_idx
  ON public.cancellation_requests (registration_id);

CREATE INDEX IF NOT EXISTS cancel_req_event_pending_idx
  ON public.cancellation_requests (event_id, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS cancel_req_user_email_idx
  ON public.cancellation_requests (user_email);

ALTER TABLE public.cancellation_requests ENABLE ROW LEVEL SECURITY;

-- Service role (used by all API routes) has full access
CREATE POLICY "service_role_all" ON public.cancellation_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can only read their own requests
CREATE POLICY "user_read_own" ON public.cancellation_requests
  FOR SELECT TO authenticated
  USING (user_email = auth.jwt()->>'email');


-- ── 4. cancellation_audit_log ─────────────────────────────────────────────────
-- Immutable append-only log of every cancellation and refund action.

CREATE TABLE IF NOT EXISTS public.cancellation_audit_log (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  registration_id     UUID        NOT NULL REFERENCES public.event_registrations(id) ON DELETE CASCADE,
  registration_code   TEXT        NOT NULL,
  action              TEXT        NOT NULL,  -- 'cancelled' | 'refund_initiated' | 'refund_processed' | 'refund_failed' | 'cancel_request_submitted' | 'cancel_request_reviewed'
  actor               TEXT        NOT NULL,  -- who performed the action
  actor_type          TEXT        NOT NULL DEFAULT 'admin',  -- 'admin' | 'user' | 'system'
  payload             JSONB,                 -- action-specific details (amounts, reasons, etc.)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_registration_idx
  ON public.cancellation_audit_log (registration_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_event_idx
  ON public.cancellation_audit_log (event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_action_idx
  ON public.cancellation_audit_log (action, created_at DESC);

ALTER TABLE public.cancellation_audit_log ENABLE ROW LEVEL SECURITY;

-- Service role full access; no direct user access (admin-only via API)
CREATE POLICY "service_role_all" ON public.cancellation_audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
