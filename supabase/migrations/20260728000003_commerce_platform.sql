-- ============================================================
-- Connected Steps — Commerce & Finance Platform
-- File: 20260728000003_commerce_platform.sql
-- ============================================================
-- New tables: merchandise, donations, sponsor packages/agreements,
-- manual payment records, payouts, financial audit log.
-- Extends: invoices (org branding, credit notes), coupons (types).
-- All amounts stored in PAISE (INTEGER) except invoices which
-- uses NUMERIC(10,2) rupees for backward compatibility.
-- ============================================================

-- ── 1. Merchandise products ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.merchandise_products (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id        UUID        REFERENCES public.events(id) ON DELETE SET NULL,
  name            TEXT        NOT NULL,
  description     TEXT,
  sku             TEXT,
  category        TEXT        NOT NULL DEFAULT 'other'
                              CONSTRAINT merch_product_category_chk
                              CHECK (category IN ('tshirt','medal','bib','nutrition','accessory','other')),
  price_paise     INTEGER     NOT NULL DEFAULT 0,
  gst_percentage  NUMERIC(5,2) NOT NULL DEFAULT 0,
  image_url       TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merch_products_org ON public.merchandise_products (organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_merch_products_event ON public.merchandise_products (event_id);

ALTER TABLE public.merchandise_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "merch_products_service" ON public.merchandise_products FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "merch_products_public_read" ON public.merchandise_products FOR SELECT USING (is_active = true);

-- ── 2. Merchandise variants ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.merchandise_variants (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID        NOT NULL REFERENCES public.merchandise_products(id) ON DELETE CASCADE,
  variant_name   TEXT        NOT NULL,
  variant_type   TEXT        NOT NULL DEFAULT 'size'
                             CONSTRAINT merch_variant_type_chk
                             CHECK (variant_type IN ('size','color','size_color','other')),
  sku            TEXT,
  price_override INTEGER,                      -- NULL = use product price
  stock_qty      INTEGER     NOT NULL DEFAULT 0,
  reserved_qty   INTEGER     NOT NULL DEFAULT 0,
  sold_qty       INTEGER     NOT NULL DEFAULT 0,
  display_order  SMALLINT    NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_merch_variants_product ON public.merchandise_variants (product_id, display_order);

ALTER TABLE public.merchandise_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "merch_variants_service" ON public.merchandise_variants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "merch_variants_public_read" ON public.merchandise_variants FOR SELECT USING (
  product_id IN (SELECT id FROM public.merchandise_products WHERE is_active = true)
);

-- ── 3. Merchandise orders ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.merchandise_orders (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id         UUID        REFERENCES public.events(id) ON DELETE SET NULL,
  registration_id  UUID        REFERENCES public.event_registrations(id) ON DELETE SET NULL,
  user_email       TEXT        NOT NULL,
  user_name        TEXT        NOT NULL,
  user_phone       TEXT,
  -- items: [{product_id, variant_id, product_name, variant_name, qty, unit_price_paise, gst_paise, line_total_paise}]
  items            JSONB       NOT NULL DEFAULT '[]',
  subtotal_paise   INTEGER     NOT NULL DEFAULT 0,
  gst_paise        INTEGER     NOT NULL DEFAULT 0,
  total_paise      INTEGER     NOT NULL DEFAULT 0,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CONSTRAINT merch_order_status_chk
                               CHECK (status IN ('pending','confirmed','packed','dispatched','delivered','cancelled')),
  fulfillment_type TEXT        NOT NULL DEFAULT 'pickup_at_event'
                               CONSTRAINT merch_fulfillment_chk
                               CHECK (fulfillment_type IN ('pickup_at_event','shipping')),
  shipping_address TEXT,
  tracking_number  TEXT,
  payment_status   TEXT        NOT NULL DEFAULT 'pending'
                               CONSTRAINT merch_pay_status_chk
                               CHECK (payment_status IN ('pending','paid','refunded')),
  payment_id       TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merch_orders_org ON public.merchandise_orders (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merch_orders_event ON public.merchandise_orders (event_id);
CREATE INDEX IF NOT EXISTS idx_merch_orders_reg ON public.merchandise_orders (registration_id);
CREATE INDEX IF NOT EXISTS idx_merch_orders_email ON public.merchandise_orders (user_email);

ALTER TABLE public.merchandise_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "merch_orders_service" ON public.merchandise_orders FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 4. Donations ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.donations (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id             UUID        REFERENCES public.events(id) ON DELETE SET NULL,
  registration_id      UUID        REFERENCES public.event_registrations(id) ON DELETE SET NULL,
  user_email           TEXT        NOT NULL,
  user_name            TEXT        NOT NULL,
  phone                TEXT,
  amount_paise         INTEGER     NOT NULL,
  campaign             TEXT        NOT NULL DEFAULT 'general',
  beneficiary          TEXT,
  payment_id           TEXT,
  payment_method       TEXT        NOT NULL DEFAULT 'razorpay'
                                   CONSTRAINT donation_method_chk
                                   CHECK (payment_method IN ('razorpay','cash','bank_transfer','upi','cheque')),
  tax_receipt_number   TEXT        UNIQUE,
  tax_receipt_sent     BOOLEAN     NOT NULL DEFAULT false,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_donations_org ON public.donations (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_donations_email ON public.donations (user_email);
CREATE INDEX IF NOT EXISTS idx_donations_event ON public.donations (event_id);

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "donations_service" ON public.donations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 5. Sponsor packages ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sponsor_packages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,
  price_paise     INTEGER     NOT NULL DEFAULT 0,
  -- deliverables: [{item: "Logo on banner", qty: 1, category: "branding"}]
  deliverables    JSONB       NOT NULL DEFAULT '[]',
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  display_order   SMALLINT    NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sponsor_packages_org ON public.sponsor_packages (organization_id, is_active, display_order);

ALTER TABLE public.sponsor_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sponsor_packages_service" ON public.sponsor_packages FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 6. Sponsor agreements ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sponsor_agreements (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id         UUID        REFERENCES public.events(id) ON DELETE SET NULL,
  event_sponsor_id UUID        REFERENCES public.event_sponsors(id) ON DELETE SET NULL,
  package_id       UUID        REFERENCES public.sponsor_packages(id) ON DELETE SET NULL,
  sponsor_name     TEXT        NOT NULL,
  contact_name     TEXT,
  contact_email    TEXT,
  contact_phone    TEXT,
  agreed_amount_paise  INTEGER NOT NULL DEFAULT 0,
  invoice_number   TEXT,
  payment_status   TEXT        NOT NULL DEFAULT 'pending'
                               CONSTRAINT sponsor_pay_status_chk
                               CHECK (payment_status IN ('pending','partial','paid','overdue','cancelled')),
  amount_received_paise INTEGER NOT NULL DEFAULT 0,
  agreement_date   DATE,
  due_date         DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sponsor_agreements_org ON public.sponsor_agreements (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sponsor_agreements_event ON public.sponsor_agreements (event_id);

ALTER TABLE public.sponsor_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sponsor_agreements_service" ON public.sponsor_agreements FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 7. Manual payment records ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.manual_payment_records (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id         UUID        REFERENCES public.events(id) ON DELETE SET NULL,
  registration_id  UUID        REFERENCES public.event_registrations(id) ON DELETE SET NULL,
  entity_type      TEXT        NOT NULL DEFAULT 'other'
                               CONSTRAINT mpr_entity_type_chk
                               CHECK (entity_type IN ('registration','membership','merchandise','donation','sponsorship','other')),
  entity_id        TEXT,
  user_email       TEXT        NOT NULL,
  user_name        TEXT        NOT NULL,
  amount_paise     INTEGER     NOT NULL,
  payment_method   TEXT        NOT NULL DEFAULT 'cash'
                               CONSTRAINT mpr_method_chk
                               CHECK (payment_method IN ('cash','bank_transfer','upi','cheque','other')),
  payment_reference TEXT,     -- UTR / cheque number / UPI transaction ID
  payment_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
  recorded_by      TEXT        NOT NULL,
  notes            TEXT,
  verified         BOOLEAN     NOT NULL DEFAULT false,
  verified_by      TEXT,
  verified_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mpr_org ON public.manual_payment_records (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mpr_entity ON public.manual_payment_records (entity_type, entity_id);

ALTER TABLE public.manual_payment_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mpr_service" ON public.manual_payment_records FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 8. Payouts ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payouts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id         UUID        REFERENCES public.events(id) ON DELETE SET NULL,
  payee_type       TEXT        NOT NULL DEFAULT 'vendor'
                               CONSTRAINT payout_payee_type_chk
                               CHECK (payee_type IN ('vendor','coach','volunteer','sponsor','service_provider','other')),
  payee_name       TEXT        NOT NULL,
  payee_email      TEXT,
  payee_phone      TEXT,
  payee_account    TEXT,       -- bank account / UPI handle
  amount_paise     INTEGER     NOT NULL,
  description      TEXT        NOT NULL,
  category         TEXT        NOT NULL DEFAULT 'other'
                               CONSTRAINT payout_category_chk
                               CHECK (category IN ('coaching','venue','logistics','catering','photography','timing','prize','merchandise','other')),
  payment_method   TEXT        NOT NULL DEFAULT 'bank_transfer'
                               CONSTRAINT payout_method_chk
                               CHECK (payment_method IN ('bank_transfer','upi','cash','cheque')),
  payment_reference TEXT,
  payment_date     DATE,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CONSTRAINT payout_status_chk
                               CHECK (status IN ('pending','processing','paid','failed','cancelled')),
  paid_by          TEXT,       -- admin email
  invoice_url      TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payouts_org ON public.payouts (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON public.payouts (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_payouts_event ON public.payouts (event_id);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payouts_service" ON public.payouts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 9. Financial audit log ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.financial_audit_log (
  id              BIGSERIAL   PRIMARY KEY,
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id        UUID        REFERENCES public.events(id) ON DELETE SET NULL,
  action          TEXT        NOT NULL,
  actor_email     TEXT        NOT NULL,
  entity_type     TEXT        NOT NULL,
  entity_id       TEXT,
  amount_paise    INTEGER,
  detail          JSONB,
  ip              TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_audit_org ON public.financial_audit_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_audit_entity ON public.financial_audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_fin_audit_action ON public.financial_audit_log (action, created_at DESC);

ALTER TABLE public.financial_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_audit_service" ON public.financial_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 10. Extend: invoices ──────────────────────────────────────────────────────

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS organization_id     UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credit_note_number  TEXT,
  ADD COLUMN IF NOT EXISTS credit_note_reason  TEXT,
  ADD COLUMN IF NOT EXISTS credit_note_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS org_gst_number      TEXT,
  ADD COLUMN IF NOT EXISTS org_name            TEXT,
  ADD COLUMN IF NOT EXISTS invoice_prefix      TEXT DEFAULT 'CS-INV';

CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices (organization_id, created_at DESC);

-- Backfill invoices belonging to the default org
UPDATE public.invoices
  SET organization_id = '00000000-0000-0000-0000-000000000001'
  WHERE organization_id IS NULL;

-- ── 11. Extend: coupons ───────────────────────────────────────────────────────

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS coupon_type           TEXT NOT NULL DEFAULT 'standard'
                                                 CONSTRAINT coupons_type_chk
                                                 CHECK (coupon_type IN ('standard','referral','corporate','early_bird','bundle')),
  ADD COLUMN IF NOT EXISTS min_order_value_paise INTEGER,
  ADD COLUMN IF NOT EXISTS referral_source_email TEXT,
  ADD COLUMN IF NOT EXISTS corporate_org_name    TEXT;

-- ── 12. updated_at triggers for new tables ────────────────────────────────────

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'merchandise_products', 'merchandise_orders',
    'sponsor_packages', 'sponsor_agreements', 'payouts'
  ]
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$s;
      CREATE TRIGGER trg_%1$s_updated_at
        BEFORE UPDATE ON public.%1$s
        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
    ', tbl);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
