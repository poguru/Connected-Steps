-- ============================================================
-- Connected Steps — Manual Invoice & Billing Module
-- Completely independent from participant registration invoices.
-- ============================================================

-- ── Invoice number sequence ───────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS manual_invoice_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION next_manual_invoice_number()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  seq_val BIGINT;
  fy_year INT;
BEGIN
  fy_year := CASE WHEN EXTRACT(MONTH FROM NOW()) < 4
                  THEN EXTRACT(YEAR FROM NOW())::INT - 1
                  ELSE EXTRACT(YEAR FROM NOW())::INT
             END;
  seq_val := nextval('manual_invoice_seq');
  RETURN 'CS-INV-' || fy_year || '-' || LPAD(seq_val::TEXT, 6, '0');
END;
$$;

-- ── Billing settings (org info shown on every invoice) ───────────────────────
CREATE TABLE IF NOT EXISTS public.billing_settings (
  id                   SERIAL      PRIMARY KEY,
  org_name             TEXT        NOT NULL DEFAULT 'Connected Steps',
  gst_number           TEXT,
  pan_number           TEXT,
  address              TEXT,
  city                 TEXT,
  state                TEXT        DEFAULT 'Telangana',
  state_code           TEXT        DEFAULT '36',
  pincode              TEXT,
  phone                TEXT,
  email                TEXT,
  website              TEXT,
  logo_url             TEXT,
  bank_name            TEXT,
  account_number       TEXT,
  ifsc_code            TEXT,
  upi_id               TEXT,
  upi_qr_url           TEXT,
  authorized_signatory TEXT,
  signature_url        TEXT,
  terms_conditions     TEXT,
  thank_you_message    TEXT        DEFAULT 'Thank you for your business!',
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.billing_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing_settings_service_role" ON public.billing_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Main invoices table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.manual_invoices (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number    TEXT        NOT NULL UNIQUE DEFAULT next_manual_invoice_number(),

  invoice_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  due_date          DATE,
  invoice_type      TEXT        NOT NULL DEFAULT 'tax_invoice'
                    CHECK (invoice_type IN ('tax_invoice','proforma','credit_note','debit_note')),
  currency          TEXT        NOT NULL DEFAULT 'INR',
  place_of_supply   TEXT,
  is_igst           BOOLEAN     NOT NULL DEFAULT false,

  -- Client details
  client_type       TEXT        NOT NULL DEFAULT 'corporate'
                    CHECK (client_type IN ('corporate','individual','government','ngo','sponsor','other')),
  company_name      TEXT,
  client_name       TEXT        NOT NULL,
  client_gst        TEXT,
  client_pan        TEXT,
  client_email      TEXT,
  client_phone      TEXT,
  billing_address   TEXT,
  shipping_address  TEXT,
  client_state      TEXT,
  client_country    TEXT        DEFAULT 'India',
  client_pincode    TEXT,

  -- GST financials (INR)
  subtotal          NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  taxable_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  cgst_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  igst_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  round_off         NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total       NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Payment tracking
  payment_terms     TEXT,
  advance_received  NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_due       NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_status    TEXT        NOT NULL DEFAULT 'draft'
                    CHECK (payment_status IN ('draft','sent','viewed','partially_paid','paid','cancelled','overdue')),
  payment_method    TEXT,
  reference_number  TEXT,

  -- Additional details
  po_number         TEXT,
  quotation_ref     TEXT,
  project_name      TEXT,
  service_period    TEXT,
  completion_date   DATE,
  internal_notes    TEXT,
  customer_notes    TEXT,
  terms_conditions  TEXT,
  thank_you_message TEXT,

  linked_invoice_id UUID        REFERENCES public.manual_invoices(id) ON DELETE SET NULL,

  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mi_status_idx  ON public.manual_invoices (payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS mi_email_idx   ON public.manual_invoices (client_email);
CREATE INDEX IF NOT EXISTS mi_company_idx ON public.manual_invoices (company_name);
CREATE INDEX IF NOT EXISTS mi_created_idx ON public.manual_invoices (created_at DESC);

CREATE OR REPLACE FUNCTION set_manual_invoice_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_mi_updated_at ON public.manual_invoices;
CREATE TRIGGER trg_mi_updated_at
  BEFORE UPDATE ON public.manual_invoices
  FOR EACH ROW EXECUTE FUNCTION set_manual_invoice_updated_at();

ALTER TABLE public.manual_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mi_service_role" ON public.manual_invoices
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Line items ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.manual_invoice_items (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID          NOT NULL REFERENCES public.manual_invoices(id) ON DELETE CASCADE,
  sort_order    INT           NOT NULL DEFAULT 0,
  description   TEXT          NOT NULL,
  quantity      NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit          TEXT,
  rate          NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_pct  NUMERIC(5,2)  NOT NULL DEFAULT 0,
  gst_pct       NUMERIC(5,2)  NOT NULL DEFAULT 18,
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mii_invoice_idx ON public.manual_invoice_items (invoice_id, sort_order);

ALTER TABLE public.manual_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mii_service_role" ON public.manual_invoice_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Payment records ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.manual_invoice_payments (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       UUID          NOT NULL REFERENCES public.manual_invoices(id) ON DELETE CASCADE,
  amount           NUMERIC(12,2) NOT NULL,
  payment_date     DATE          NOT NULL DEFAULT CURRENT_DATE,
  payment_method   TEXT          NOT NULL DEFAULT 'bank_transfer',
  reference_number TEXT,
  notes            TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE public.manual_invoice_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mip_service_role" ON public.manual_invoice_payments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Email delivery logs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.manual_invoice_email_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     UUID        NOT NULL REFERENCES public.manual_invoices(id) ON DELETE CASCADE,
  to_emails      TEXT[]      NOT NULL DEFAULT '{}',
  cc_emails      TEXT[],
  bcc_emails     TEXT[],
  subject        TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'sent'
                 CHECK (status IN ('queued','sending','sent','delivered','failed','bounced')),
  message_id     TEXT,
  failure_reason TEXT,
  retry_count    INT         NOT NULL DEFAULT 0,
  sent_at        TIMESTAMPTZ,
  delivered_at   TIMESTAMPTZ,
  opened_at      TIMESTAMPTZ,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS miel_invoice_idx ON public.manual_invoice_email_logs (invoice_id, created_at DESC);

ALTER TABLE public.manual_invoice_email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "miel_service_role" ON public.manual_invoice_email_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Audit history ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.manual_invoice_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID        NOT NULL REFERENCES public.manual_invoices(id) ON DELETE CASCADE,
  action      TEXT        NOT NULL,
  description TEXT,
  actor       TEXT,
  ip_address  TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mih_invoice_idx ON public.manual_invoice_history (invoice_id, created_at DESC);

ALTER TABLE public.manual_invoice_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mih_service_role" ON public.manual_invoice_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Attachments ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.manual_invoice_attachments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID        NOT NULL REFERENCES public.manual_invoices(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  path        TEXT        NOT NULL,
  mime_type   TEXT        NOT NULL,
  size        INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.manual_invoice_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mia_service_role" ON public.manual_invoice_attachments
  FOR ALL TO service_role USING (true) WITH CHECK (true);
