-- ============================================================
-- Connected Steps — Multi-Organization SaaS Foundation
-- File: 20260728000001_organizations.sql
-- ============================================================
-- Introduces organizations as the top-level tenant entity.
-- Safe additive changes: ADD COLUMN IF NOT EXISTS only.
-- Existing data is migrated to the default "Connected Steps" org.
-- ============================================================


-- ── 1. organizations ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organizations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  slug             TEXT        NOT NULL UNIQUE,

  -- Branding
  logo_url         TEXT,
  favicon_url      TEXT,
  primary_color    TEXT        NOT NULL DEFAULT '#e8620a',
  secondary_color  TEXT        NOT NULL DEFAULT '#1a1a1a',

  -- Identity / localization
  domain           TEXT,
  timezone         TEXT        NOT NULL DEFAULT 'Asia/Kolkata',
  currency         TEXT        NOT NULL DEFAULT 'INR',

  -- Contact
  contact_email    TEXT,
  contact_phone    TEXT,
  support_email    TEXT,
  support_phone    TEXT,
  wa_number        TEXT,

  -- GST / legal
  gst_number       TEXT,
  company_name     TEXT,
  billing_address  TEXT,

  -- Social
  website          TEXT,
  instagram_url    TEXT,
  facebook_url     TEXT,
  twitter_url      TEXT,
  linkedin_url     TEXT,

  -- Policies (markdown / HTML)
  privacy_policy   TEXT,
  terms_of_service TEXT,
  refund_policy    TEXT,

  -- SaaS billing
  plan             TEXT        NOT NULL DEFAULT 'free'
                   CHECK (plan IN ('free', 'professional', 'enterprise')),
  plan_status      TEXT        NOT NULL DEFAULT 'active'
                   CHECK (plan_status IN ('active', 'trialing', 'past_due', 'cancelled')),
  subscription_id  TEXT,
  plan_limits      JSONB       NOT NULL DEFAULT '{}',

  -- Platform flags
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  is_default       BOOLEAN     NOT NULL DEFAULT FALSE,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug   ON public.organizations (slug);
CREATE INDEX IF NOT EXISTS idx_organizations_active ON public.organizations (is_active) WHERE is_active = TRUE;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orgs_service_role_all" ON public.organizations
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 2. organization_members ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organization_members (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_email       TEXT        NOT NULL,
  role             TEXT        NOT NULL DEFAULT 'read_only'
                   CHECK (role IN (
                     'owner', 'admin', 'finance', 'operations',
                     'volunteer_manager', 'communications', 'support', 'read_only'
                   )),
  permissions      JSONB       NOT NULL DEFAULT '{}',
  invited_by       TEXT,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organization_id, user_email)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org   ON public.organization_members (organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_email ON public.organization_members (user_email);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_service_role_all" ON public.organization_members
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 3. organization_settings ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organization_settings (
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key              TEXT        NOT NULL,
  value            TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, key)
);

ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_settings_service_role_all" ON public.organization_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 4. organization_features ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organization_features (
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature          TEXT        NOT NULL,
  enabled          BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, feature)
);

ALTER TABLE public.organization_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_features_service_role_all" ON public.organization_features
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 5. organization_audit_logs ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organization_audit_logs (
  id               BIGSERIAL   PRIMARY KEY,
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action           TEXT        NOT NULL,
  actor_email      TEXT        NOT NULL,
  resource_type    TEXT,
  resource_id      TEXT,
  detail           JSONB,
  ip               TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_audit_org   ON public.organization_audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_audit_actor ON public.organization_audit_logs (actor_email);

ALTER TABLE public.organization_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_audit_service_role_all" ON public.organization_audit_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 6. Seed default "Connected Steps" organization ────────────────────────────

INSERT INTO public.organizations (
  id, name, slug, is_default, plan, plan_status,
  primary_color, secondary_color,
  timezone, currency,
  contact_email, website
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Connected Steps',
  'connected-steps',
  TRUE,
  'enterprise',
  'active',
  '#e8620a',
  '#1a1a1a',
  'Asia/Kolkata',
  'INR',
  'admin@connectedsteps.in',
  'https://connectedsteps.in'
) ON CONFLICT (id) DO NOTHING;


-- ── 7. Add organization_id to events ─────────────────────────────────────────

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS organization_id UUID
  DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
  REFERENCES public.organizations(id) ON DELETE SET NULL;

UPDATE public.events
  SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_org ON public.events (organization_id);


-- ── 8. Add organization_id to coupons ────────────────────────────────────────

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS organization_id UUID
  DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
  REFERENCES public.organizations(id) ON DELETE SET NULL;

UPDATE public.coupons
  SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_coupons_org ON public.coupons (organization_id);


-- ── 9. Add organization_id to membership_plans ───────────────────────────────

ALTER TABLE public.membership_plans
  ADD COLUMN IF NOT EXISTS organization_id UUID
  DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
  REFERENCES public.organizations(id) ON DELETE SET NULL;

UPDATE public.membership_plans
  SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_membership_plans_org ON public.membership_plans (organization_id);


-- ── 10. Add organization_id to comm_templates ─────────────────────────────────

ALTER TABLE public.comm_templates
  ADD COLUMN IF NOT EXISTS organization_id UUID
  DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
  REFERENCES public.organizations(id) ON DELETE SET NULL;

UPDATE public.comm_templates
  SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_comm_templates_org ON public.comm_templates (organization_id);


-- ── 11. Add organization_id to existing audit_logs ────────────────────────────

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS organization_id UUID
  DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
  REFERENCES public.organizations(id) ON DELETE SET NULL;

UPDATE public.audit_logs
  SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON public.audit_logs (organization_id);


-- ── 12. Seed a default org member for the platform admin ─────────────────────
-- Adds a placeholder "owner" entry so the admin API can resolve context.
-- The user_email 'admin' is a sentinel matching getAdminEmail() = 'admin'.

INSERT INTO public.organization_members (organization_id, user_email, role, invited_by)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin',
  'owner',
  'system'
) ON CONFLICT (organization_id, user_email) DO NOTHING;


-- ── 13. updated_at trigger for organizations ──────────────────────────────────

CREATE OR REPLACE FUNCTION update_organizations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION update_organizations_updated_at();
