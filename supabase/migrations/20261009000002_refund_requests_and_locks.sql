-- Migration: 20261009000002_refund_requests_and_locks.sql
--
-- 1. Participant refund requests (request only; never executes a refund).
-- 2. Concurrency lock: at most ONE pending refund per registration.
--    The application inserts the pending refund row BEFORE calling Razorpay, so a
--    duplicate click or concurrent admin request fails on this index instead of
--    issuing a second refund.
-- 3. At most one open (requested/approved) refund request per registration.

-- ── 1. Concurrency lock on refunds ─────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS it_run_refunds_one_pending_per_registration
  ON public.it_run_refunds (registration_id)
  WHERE status = 'pending';

-- ── 2. Refund requests ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.it_run_refund_requests (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID        NOT NULL REFERENCES public.it_run_events(id) ON DELETE CASCADE,
  registration_id     UUID        NOT NULL REFERENCES public.it_run_registrations(id) ON DELETE CASCADE,
  requested_by_email  TEXT        NOT NULL,
  -- Participant's reason (10-1000 chars, enforced below)
  request_reason      TEXT        NOT NULL CHECK (char_length(request_reason) BETWEEN 10 AND 1000),
  -- requested -> approved | rejected ; approved -> executed (refund issued) ; any open -> cancelled
  status              TEXT        NOT NULL DEFAULT 'requested'
                      CHECK (status IN ('requested', 'approved', 'rejected', 'executed', 'cancelled')),
  -- Admin's auditable explanation; shown to the participant as the admin response
  decision_explanation TEXT       CHECK (decision_explanation IS NULL OR char_length(decision_explanation) <= 1000),
  decided_by_email    TEXT,
  decided_at          TIMESTAMPTZ,
  refund_id           UUID        REFERENCES public.it_run_refunds(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS it_run_refund_requests_one_open_per_registration
  ON public.it_run_refund_requests (registration_id)
  WHERE status IN ('requested', 'approved');

CREATE INDEX IF NOT EXISTS it_run_refund_requests_status_idx
  ON public.it_run_refund_requests (status, created_at);

CREATE INDEX IF NOT EXISTS it_run_refund_requests_registration_idx
  ON public.it_run_refund_requests (registration_id);

ALTER TABLE public.it_run_refund_requests ENABLE ROW LEVEL SECURITY;

-- Service role only. All reads/writes go through server routes that check ownership or role.
DROP POLICY IF EXISTS no_access_refund_requests ON public.it_run_refund_requests;
CREATE POLICY no_access_refund_requests ON public.it_run_refund_requests
  FOR ALL USING (false);
