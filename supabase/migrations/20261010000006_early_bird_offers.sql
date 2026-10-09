-- Migration: 20261010000006_early_bird_offers.sql
--
-- Admin-controlled early bird offers, one per category per window. An offer is NOT a coupon: a
-- registration uses either an early bird offer or a coupon, never both.
--
-- Status: draft | active | paused | archived. "Scheduled" and "expired" are not stored; they follow from
-- the time window (starts_at inclusive, ends_at exclusive) on an active offer.
--
-- Redemption quota counts REGISTRATIONS (per booking, not per runner). A place is claimed atomically when a
-- registration is created and released when that registration fails, expires, or is refunded.
--
-- Safe to re-run. Adds nullable columns only; existing registrations keep their prices and history.

CREATE TABLE IF NOT EXISTS public.it_run_early_bird_offers (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             UUID        NOT NULL REFERENCES public.it_run_events(id) ON DELETE CASCADE,
  category_id          UUID        NOT NULL REFERENCES public.it_run_categories(id),
  name                 TEXT        NOT NULL CHECK (char_length(name) BETWEEN 3 AND 120),
  discount_type        TEXT        NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  -- percent: 1-90. fixed: a rupee amount above zero (the service also caps it at the base price)
  discount_value       INTEGER     NOT NULL CHECK (discount_value > 0),
  CONSTRAINT it_run_early_bird_percent_range CHECK (discount_type <> 'percent' OR discount_value BETWEEN 1 AND 90),
  starts_at            TIMESTAMPTZ NOT NULL,
  ends_at              TIMESTAMPTZ NOT NULL,
  CONSTRAINT it_run_early_bird_window CHECK (ends_at > starts_at),
  status               TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  redemption_limit     INTEGER     CHECK (redemption_limit IS NULL OR redemption_limit > 0),
  redemptions_used     INTEGER     NOT NULL DEFAULT 0 CHECK (redemptions_used >= 0),
  CONSTRAINT it_run_early_bird_within_limit CHECK (redemption_limit IS NULL OR redemptions_used <= redemption_limit),
  min_payable_rupees   INTEGER     NOT NULL DEFAULT 0 CHECK (min_payable_rupees >= 0),
  notes                TEXT        CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_by           TEXT,
  updated_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS it_run_early_bird_offers_lookup_idx
  ON public.it_run_early_bird_offers (category_id, status, starts_at, ends_at);

ALTER TABLE public.it_run_early_bird_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS no_access_early_bird_offers ON public.it_run_early_bird_offers;
CREATE POLICY no_access_early_bird_offers ON public.it_run_early_bird_offers FOR ALL USING (false);

-- Snapshot of the offer used by a registration (nullable: most registrations have none)
ALTER TABLE public.it_run_registrations
  ADD COLUMN IF NOT EXISTS early_bird_offer_id UUID REFERENCES public.it_run_early_bird_offers(id);

-- Atomically claim one redemption. Succeeds only while the offer is active, inside its window, and below its
-- limit. The row lock serialises concurrent checkouts, so the limit cannot be exceeded.
CREATE OR REPLACE FUNCTION public.itr_early_bird_claim(p_offer_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.it_run_early_bird_offers
  SET redemptions_used = redemptions_used + 1,
      updated_at = now()
  WHERE id = p_offer_id
    AND status = 'active'
    AND now() >= starts_at
    AND now() < ends_at
    AND (redemption_limit IS NULL OR redemptions_used < redemption_limit);
  RETURN FOUND;
END;
$$;

-- Give back one redemption (failed, expired, or refunded registration). Never goes below zero.
CREATE OR REPLACE FUNCTION public.itr_early_bird_release(p_offer_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.it_run_early_bird_offers
  SET redemptions_used = GREATEST(redemptions_used - 1, 0),
      updated_at = now()
  WHERE id = p_offer_id;
END;
$$;
