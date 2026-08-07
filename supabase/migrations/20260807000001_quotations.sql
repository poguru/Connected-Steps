-- ============================================================
-- Connected Steps — Quotation & Event Proposal Module
-- Completely independent from invoice and registration tables.
-- ============================================================

-- ── Quotation number sequence ─────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS quotation_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION next_quotation_number()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  seq_val BIGINT;
  fy_year INT;
BEGIN
  fy_year := CASE WHEN EXTRACT(MONTH FROM NOW()) < 4
                  THEN EXTRACT(YEAR FROM NOW())::INT - 1
                  ELSE EXTRACT(YEAR FROM NOW())::INT
             END;
  seq_val := nextval('quotation_seq');
  RETURN 'CS-QUO-' || fy_year || '-' || LPAD(seq_val::TEXT, 6, '0');
END;
$$;

-- ── quotation_templates (reusable preset data) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quotation_templates (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  category      TEXT,  -- corporate_marathon, workshop, sponsorship, etc.
  template_data JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.quotation_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qt_service_role" ON public.quotation_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── quotations (main table) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quotations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number      TEXT        NOT NULL UNIQUE DEFAULT next_quotation_number(),
  version               INT         NOT NULL DEFAULT 1,
  status                TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent','viewed','accepted','rejected','expired','converted')),

  -- Client details
  company_name          TEXT,
  client_name           TEXT        NOT NULL DEFAULT '',
  client_designation    TEXT,
  client_department     TEXT,
  client_gst            TEXT,
  client_pan            TEXT,
  client_email          TEXT,
  client_phone          TEXT,
  billing_address       TEXT,
  project_location      TEXT,
  client_website        TEXT,

  -- Proposal meta
  proposal_title        TEXT        NOT NULL DEFAULT '',
  project_name          TEXT,
  event_date            DATE,
  valid_until           DATE,
  prepared_by           TEXT,
  reference_number      TEXT,

  -- Rich text sections (HTML from editor)
  executive_summary     TEXT,
  scope_of_work         TEXT,
  terms_conditions      TEXT,
  payment_terms_notes   TEXT,

  -- Structured JSON sections
  deliverables          JSONB       NOT NULL DEFAULT '[]',
  sponsorship_packages  JSONB       NOT NULL DEFAULT '[]',
  timeline_milestones   JSONB       NOT NULL DEFAULT '[]',
  payment_milestones    JSONB       NOT NULL DEFAULT '[]',

  -- Financials
  currency              TEXT        NOT NULL DEFAULT 'INR',
  place_of_supply       TEXT,
  is_igst               BOOLEAN     NOT NULL DEFAULT FALSE,
  advance_percentage    NUMERIC(5,2),
  subtotal              NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  taxable_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  cgst_amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst_amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  igst_amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  round_off             NUMERIC(6,2)  NOT NULL DEFAULT 0,
  grand_total           NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Template used
  template_id           UUID REFERENCES public.quotation_templates(id) ON DELETE SET NULL,

  -- Conversion to invoice
  converted_invoice_id  UUID,   -- references manual_invoices(id)
  converted_at          TIMESTAMPTZ,

  -- Notes
  internal_notes        TEXT,
  customer_notes        TEXT,

  -- Meta
  created_by            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quo_status_idx ON public.quotations (status, created_at DESC);
CREATE INDEX IF NOT EXISTS quo_client_idx ON public.quotations (client_name, company_name);

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quo_service_role" ON public.quotations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── quotation_items (line items) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quotation_items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id  UUID        NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  sort_order    INT         NOT NULL DEFAULT 0,
  description   TEXT        NOT NULL,
  quantity      NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit          TEXT,
  rate          NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_pct  NUMERIC(5,2)  NOT NULL DEFAULT 0,
  gst_pct       NUMERIC(5,2)  NOT NULL DEFAULT 18,
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS qi_quotation_idx ON public.quotation_items (quotation_id, sort_order);

ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qi_service_role" ON public.quotation_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── quotation_email_logs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quotation_email_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id   UUID        NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS qel_quotation_idx ON public.quotation_email_logs (quotation_id, created_at DESC);

ALTER TABLE public.quotation_email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qel_service_role" ON public.quotation_email_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── quotation_history (audit trail) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quotation_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id  UUID        NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  action        TEXT        NOT NULL,
  description   TEXT,
  actor         TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS qh_quotation_idx ON public.quotation_history (quotation_id, created_at DESC);

ALTER TABLE public.quotation_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qh_service_role" ON public.quotation_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── quotation_attachments (additional files) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quotation_attachments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id  UUID        NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  label         TEXT,        -- "Company Profile", "Route Map", etc.
  path          TEXT        NOT NULL,
  mime_type     TEXT        NOT NULL,
  size_bytes    INT,
  bucket        TEXT        NOT NULL DEFAULT 'quotation-attachments',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.quotation_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qa_service_role" ON public.quotation_attachments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── quotation_status_history ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quotation_status_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id  UUID        NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  from_status   TEXT,
  to_status     TEXT        NOT NULL,
  notes         TEXT,
  actor         TEXT,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS qsh_quotation_idx ON public.quotation_status_history (quotation_id, changed_at DESC);

ALTER TABLE public.quotation_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qsh_service_role" ON public.quotation_status_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Seed a few starter templates ─────────────────────────────────────────────
INSERT INTO public.quotation_templates (name, category, template_data) VALUES
(
  'Corporate Marathon',
  'corporate_marathon',
  '{
    "executive_summary": "<p>Connected Steps is pleased to submit this proposal for organizing a corporate marathon event. We bring extensive experience in event management, route planning, participant management, and race day operations to deliver a world-class running experience for your organization.</p>",
    "scope_of_work": "<h3>Scope of Work</h3><ul><li>Event Planning &amp; Coordination</li><li>Route Design &amp; Management</li><li>Online Registration Platform</li><li>BIB &amp; Kit Distribution</li><li>Race Day Operations</li><li>Timing System</li><li>Photography &amp; Videography</li><li>Medical Support</li><li>Certificates &amp; Medals</li><li>Post-Event Report</li></ul>",
    "deliverables": [
      {"id":"1","label":"Finisher Medal","checked":true},
      {"id":"2","label":"Participant T-Shirt","checked":true},
      {"id":"3","label":"Race BIB","checked":true},
      {"id":"4","label":"Breakfast","checked":true},
      {"id":"5","label":"Timing Chip","checked":true},
      {"id":"6","label":"Photography","checked":true},
      {"id":"7","label":"Finisher Certificate","checked":true},
      {"id":"8","label":"Hydration Stations","checked":true},
      {"id":"9","label":"Medical Support","checked":true},
      {"id":"10","label":"Goodie Bag","checked":false}
    ],
    "terms_conditions": "<p><strong>Terms &amp; Conditions</strong></p><ul><li>This proposal is valid for 30 days from the date of issue.</li><li>50% advance payment is required to confirm the booking.</li><li>Balance payment is due 7 days before the event.</li><li>Cancellation within 30 days of event: 25% cancellation charge.</li><li>Cancellation within 15 days of event: 50% cancellation charge.</li><li>Connected Steps is not liable for cancellations due to force majeure.</li></ul>"
  }'
),
(
  'Photography & Videography',
  'photography',
  '{
    "executive_summary": "<p>Connected Steps offers professional event photography and videography services tailored to running events, corporate wellness programs, and community gatherings. Our team of experienced photographers and videographers ensure every milestone moment is beautifully captured.</p>",
    "scope_of_work": "<h3>Photography Services</h3><ul><li>Pre-event setup coverage</li><li>Start line photography</li><li>On-route photography at key milestones</li><li>Finish line photography</li><li>Award ceremony coverage</li><li>Edited high-resolution photos within 5 working days</li></ul><h3>Videography Services</h3><ul><li>Highlight reel (2-3 minutes)</li><li>Full event documentary (15-20 minutes)</li><li>Social media clips</li><li>Drone footage (subject to permissions)</li></ul>",
    "deliverables": [
      {"id":"1","label":"High-resolution photos (edited)","checked":true},
      {"id":"2","label":"Highlight reel video","checked":true},
      {"id":"3","label":"Social media clips","checked":true},
      {"id":"4","label":"Online gallery link","checked":true},
      {"id":"5","label":"Drone footage","checked":false},
      {"id":"6","label":"Full documentary","checked":false}
    ]
  }'
),
(
  'Sponsorship Package',
  'sponsorship',
  '{
    "executive_summary": "<p>We invite you to be a part of the Connected Steps running community as a valued sponsor. Our events attract health-conscious professionals, fitness enthusiasts, and corporate teams — giving your brand premium visibility among an engaged audience.</p>",
    "sponsorship_packages": [
      {"id":"1","name":"Title Sponsor","price":500000,"color":"#FFD700","benefits":["Exclusive naming rights to the event","Logo on BIB, T-Shirt, Medal ribbon","Stage branding","Expo booth (10x10 ft)","PA announcements throughout event","Social media feature posts (5)","Digital promotion","Banner placement (10 locations)"]},
      {"id":"2","name":"Gold Sponsor","price":250000,"color":"#FFA500","benefits":["Logo on T-Shirt and BIB","Expo booth (6x6 ft)","Stage branding (side panel)","Social media posts (3)","Banner placement (5 locations)","PA announcements (2)"]},
      {"id":"3","name":"Silver Sponsor","price":100000,"color":"#C0C0C0","benefits":["Logo on T-Shirt","Standee at venue","Social media mention (1)","Banner placement (3 locations)"]},
      {"id":"4","name":"Associate Sponsor","price":50000,"color":"#CD7F32","benefits":["Logo on event backdrop","Standee at venue","Social media mention"]}
    ]
  }'
)
ON CONFLICT DO NOTHING;
