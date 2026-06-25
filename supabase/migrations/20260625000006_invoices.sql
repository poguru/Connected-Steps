-- ============================================================
-- Connected Steps — GST Invoice Management System
-- File: 20260625000006_invoices.sql
-- ============================================================

-- ── Invoice number sequence ───────────────────────────────────────────────────
-- Atomic sequential invoice numbers: CS-INV-YYYY-NNNNNN
-- Financial year is determined at creation time.

CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  seq_val  BIGINT;
  fy_year  INT;
BEGIN
  -- Financial year in India: April–March. If month < 4, use previous calendar year.
  fy_year  := CASE WHEN EXTRACT(MONTH FROM NOW()) < 4
                   THEN EXTRACT(YEAR FROM NOW())::INT - 1
                   ELSE EXTRACT(YEAR FROM NOW())::INT
              END;
  seq_val  := nextval('invoice_seq');
  RETURN 'CS-INV-' || fy_year || '-' || LPAD(seq_val::TEXT, 6, '0');
END;
$$;

-- ── Invoices table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number      TEXT        NOT NULL UNIQUE DEFAULT next_invoice_number(),

  -- Customer
  user_email          TEXT        NOT NULL,
  user_name           TEXT        NOT NULL,
  user_phone          TEXT,

  -- Product linkage (exactly one should be set)
  registration_id     TEXT,           -- event_registrations.id
  membership_id       UUID,           -- memberships primary key (user_email+plan)
  event_id            UUID,

  -- Payment
  payment_id          TEXT,           -- Razorpay payment ID
  order_id            TEXT,           -- Razorpay order ID
  product_name        TEXT        NOT NULL,
  product_type        TEXT        NOT NULL CHECK (product_type IN ('event','membership','training_plan','coaching')),

  -- GST financials (all amounts in INR rupees)
  subtotal            NUMERIC(10,2) NOT NULL,
  gst_percentage      NUMERIC(5,2)  NOT NULL DEFAULT 6.00,
  gst_amount          NUMERIC(10,2) NOT NULL,
  total_amount        NUMERIC(10,2) NOT NULL,
  currency            TEXT        NOT NULL DEFAULT 'INR',

  -- Invoice state
  invoice_status      TEXT        NOT NULL DEFAULT 'generated'
                        CHECK (invoice_status IN ('generated','sent','failed','cancelled')),
  invoice_html        TEXT,           -- stored HTML for PDF rendering

  -- Email tracking
  email_sent          BOOLEAN     NOT NULL DEFAULT false,
  email_sent_at       TIMESTAMPTZ,
  email_ses_message_id TEXT,
  email_retry_count   INTEGER     NOT NULL DEFAULT 0,
  email_error         TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS invoices_user_email_idx    ON public.invoices (user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_registration_idx  ON public.invoices (registration_id) WHERE registration_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_membership_idx    ON public.invoices (membership_id)   WHERE membership_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_payment_idx       ON public.invoices (payment_id)      WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_status_idx        ON public.invoices (invoice_status, created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_invoice_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_invoice_updated_at ON public.invoices;
CREATE TRIGGER trg_invoice_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION set_invoice_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
-- All reads/writes go through the service role (API layer) — no direct client access.

-- ── GST config table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gst_config (
  id          SERIAL      PRIMARY KEY,
  rate        NUMERIC(5,2) NOT NULL DEFAULT 6.00,
  description TEXT,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.gst_config (rate, description) VALUES (6.00, 'Default GST rate for Connected Steps services')
  ON CONFLICT DO NOTHING;
