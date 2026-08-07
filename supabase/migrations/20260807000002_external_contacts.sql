-- ============================================================
-- Connected Steps — External Contacts & Bulk Communication
-- Completely independent from users / registrations tables.
-- ============================================================

-- ── external_contacts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.external_contacts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name        TEXT        NOT NULL,
  company_name     TEXT,
  designation      TEXT,
  email            TEXT,
  mobile           TEXT,
  whatsapp_number  TEXT,
  city             TEXT,
  state            TEXT,
  country          TEXT        NOT NULL DEFAULT 'India',
  tags             TEXT[]      NOT NULL DEFAULT '{}',
  notes            TEXT,
  source           TEXT,          -- manual, import, csv, api, etc.

  -- Consent
  email_consent    BOOLEAN     NOT NULL DEFAULT FALSE,
  whatsapp_consent BOOLEAN     NOT NULL DEFAULT FALSE,
  sms_consent      BOOLEAN     NOT NULL DEFAULT FALSE,
  consent_date     TIMESTAMPTZ,
  consent_source   TEXT,          -- import, form, verbal, etc.
  consent_proof    TEXT,          -- URL or description

  -- Status
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  do_not_contact   BOOLEAN     NOT NULL DEFAULT FALSE,
  unsubscribed_at  TIMESTAMPTZ,
  unsubscribe_channel TEXT,       -- email, whatsapp

  -- Activity timestamps (denormalized for perf)
  last_contacted   TIMESTAMPTZ,
  last_opened_email TIMESTAMPTZ,
  last_replied     TIMESTAMPTZ,

  -- Import back-ref
  import_id        UUID,          -- references contact_import_history(id)

  -- Meta
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ec_email_unique    ON public.external_contacts (LOWER(email))          WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ec_mobile_unique   ON public.external_contacts (mobile)               WHERE mobile IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ec_wa_unique       ON public.external_contacts (whatsapp_number)      WHERE whatsapp_number IS NOT NULL;
CREATE INDEX        IF NOT EXISTS ec_name_idx        ON public.external_contacts (full_name);
CREATE INDEX        IF NOT EXISTS ec_company_idx     ON public.external_contacts (company_name);
CREATE INDEX        IF NOT EXISTS ec_active_idx      ON public.external_contacts (is_active, do_not_contact);
CREATE INDEX        IF NOT EXISTS ec_tags_idx        ON public.external_contacts USING GIN (tags);

ALTER TABLE public.external_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ec_service_role" ON public.external_contacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── contact_lists ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_lists (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  description  TEXT,
  category     TEXT,       -- corporate, sponsors, schools, media, etc.
  color        TEXT        DEFAULT '#e8620a',
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cl_service_role" ON public.contact_lists
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── contact_list_members ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_list_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id     UUID        NOT NULL REFERENCES public.contact_lists(id) ON DELETE CASCADE,
  contact_id  UUID        NOT NULL REFERENCES public.external_contacts(id) ON DELETE CASCADE,
  added_by    TEXT,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (list_id, contact_id)
);

CREATE INDEX IF NOT EXISTS clm_list_idx    ON public.contact_list_members (list_id);
CREATE INDEX IF NOT EXISTS clm_contact_idx ON public.contact_list_members (contact_id);

ALTER TABLE public.contact_list_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clm_service_role" ON public.contact_list_members
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── contact_import_history ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_import_history (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  filename                 TEXT        NOT NULL,
  file_type                TEXT        NOT NULL,   -- csv, xlsx
  duplicate_handling       TEXT        NOT NULL DEFAULT 'skip',  -- skip, update, merge
  total_rows               INT         NOT NULL DEFAULT 0,
  imported                 INT         NOT NULL DEFAULT 0,
  updated                  INT         NOT NULL DEFAULT 0,
  skipped                  INT         NOT NULL DEFAULT 0,
  failed                   INT         NOT NULL DEFAULT 0,
  errors                   JSONB       NOT NULL DEFAULT '[]',
  status                   TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','processing','completed','failed')),
  compliance_acknowledged  BOOLEAN     NOT NULL DEFAULT FALSE,
  list_ids                 UUID[]      DEFAULT '{}',
  imported_by              TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.contact_import_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cih_service_role" ON public.contact_import_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── external_contact_activity ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.external_contact_activity (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id     UUID        NOT NULL REFERENCES public.external_contacts(id) ON DELETE CASCADE,
  activity_type  TEXT        NOT NULL,
  -- email_sent, whatsapp_sent, email_opened, email_clicked, replied, bounced, unsubscribed, imported, updated
  campaign_id    UUID,
  subject        TEXT,
  details        JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS eca_contact_idx ON public.external_contact_activity (contact_id, created_at DESC);

ALTER TABLE public.external_contact_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eca_service_role" ON public.external_contact_activity
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── external_contact_tags (normalised tag registry) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.external_contact_tags (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT    NOT NULL UNIQUE,
  color      TEXT    DEFAULT '#6b7280',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.external_contact_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ect_service_role" ON public.external_contact_tags
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── external_contact_consent (audit log for consent changes) ──────────────────
CREATE TABLE IF NOT EXISTS public.external_contact_consent (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id     UUID        NOT NULL REFERENCES public.external_contacts(id) ON DELETE CASCADE,
  channel        TEXT        NOT NULL,   -- email, whatsapp, sms
  action         TEXT        NOT NULL,   -- opt_in, opt_out, do_not_contact
  source         TEXT,                   -- import, admin, unsubscribe_link
  ip_address     TEXT,
  changed_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ecc_contact_idx ON public.external_contact_consent (contact_id, created_at DESC);

ALTER TABLE public.external_contact_consent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecc_service_role" ON public.external_contact_consent
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Seed starter lists ────────────────────────────────────────────────────────
INSERT INTO public.contact_lists (name, category, color, description) VALUES
  ('Corporate HR',      'corporate',  '#3b82f6', 'Corporate HR contacts for marathon events'),
  ('Sponsors',          'sponsors',   '#f59e0b', 'Event sponsors and potential sponsors'),
  ('Media',             'media',      '#8b5cf6', 'Press, journalists, photographers'),
  ('Event Organizers',  'organizers', '#10b981', 'External event organizers and partners'),
  ('Schools & Colleges','education',  '#ec4899', 'Educational institutions'),
  ('NGOs',              'ngo',        '#14b8a6', 'Non-profit organizations'),
  ('Vendors',           'vendor',     '#6b7280', 'Vendors and service providers'),
  ('Clients',           'client',     '#e8620a', 'Active and past clients')
ON CONFLICT DO NOTHING;
