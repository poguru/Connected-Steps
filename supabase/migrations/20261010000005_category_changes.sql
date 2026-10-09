-- Migration: 20261010000005_category_changes.sql
--
-- Records a paid category upgrade. A change is NOT applied until Razorpay confirms the payment for
-- the difference. Until then the registration keeps its original category.
--
-- Access: server routes only (RLS enabled, no public policy).
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.it_run_category_changes (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id     UUID        NOT NULL REFERENCES public.it_run_registrations(id) ON DELETE CASCADE,
  from_category_id    UUID        NOT NULL REFERENCES public.it_run_categories(id),
  to_category_id      UUID        NOT NULL REFERENCES public.it_run_categories(id),
  -- Difference to pay, in paise (the registration price is stored in rupees)
  amount_paise        INTEGER     NOT NULL CHECK (amount_paise > 0),
  razorpay_order_id   TEXT        UNIQUE,
  razorpay_payment_id TEXT,
  -- pending: order created, seat held; paid: applied; cancelled: abandoned or expired, seat released
  status              TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'paid', 'cancelled')),
  requested_by_email  TEXT        NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  CHECK (from_category_id <> to_category_id)
);

-- At most one open change per registration (no stacked orders or double seats)
CREATE UNIQUE INDEX IF NOT EXISTS it_run_category_changes_one_pending
  ON public.it_run_category_changes (registration_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS it_run_category_changes_registration_idx
  ON public.it_run_category_changes (registration_id, created_at DESC);

ALTER TABLE public.it_run_category_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS no_access_category_changes ON public.it_run_category_changes;
CREATE POLICY no_access_category_changes ON public.it_run_category_changes
  FOR ALL USING (false);
