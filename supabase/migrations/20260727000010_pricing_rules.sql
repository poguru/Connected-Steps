-- Phase 2: Dynamic Pricing Rules
-- Supplements the existing early_bird_ends_at / price mechanism with
-- flexible pricing tiers (group discounts, corporate rates, referral discounts).
-- Existing coupon codes are handled by a separate coupon table (if it exists)
-- or the coupons column on events; this table handles non-coupon pricing rules.

CREATE TABLE IF NOT EXISTS public.event_pricing_rules (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,

  -- Classification
  -- group      = discount when min_participants or more register in one booking
  -- corporate  = flat/percent price for participants matching a corporate code
  -- tiered     = price changes based on registration count reaching a threshold
  -- referral   = discount applied via referral link/code
  rule_type      TEXT        NOT NULL,

  label          TEXT        NOT NULL,   -- shown to participants, e.g. "Group Discount (4+)"
  description    TEXT,

  -- Discount
  discount_type  TEXT        NOT NULL DEFAULT 'flat',  -- flat | percent
  discount_value INTEGER     NOT NULL DEFAULT 0,        -- INR or percentage points

  -- Activation thresholds
  min_participants INTEGER,   -- group rules: minimum participants in booking
  max_uses       INTEGER,     -- global cap; NULL = unlimited
  uses_count     INTEGER      NOT NULL DEFAULT 0,

  -- Validity window
  valid_from     TIMESTAMPTZ,
  valid_until    TIMESTAMPTZ,

  -- Extra conditions (jsonb for future extensibility)
  conditions     JSONB        NOT NULL DEFAULT '{}',

  is_active      BOOLEAN      NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT pricing_rule_type_check CHECK (
    rule_type IN ('group', 'corporate', 'tiered', 'referral')
  ),
  CONSTRAINT pricing_discount_type_check CHECK (
    discount_type IN ('flat', 'percent')
  ),
  CONSTRAINT pricing_percent_range CHECK (
    discount_type != 'percent' OR (discount_value BETWEEN 1 AND 100)
  )
);

CREATE INDEX IF NOT EXISTS event_pricing_rules_event_idx
  ON public.event_pricing_rules (event_id, rule_type)
  WHERE is_active = true;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.event_pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.event_pricing_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admins_manage_pricing" ON public.event_pricing_rules
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE email = auth.email() AND role IN ('admin', 'coach'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE email = auth.email() AND role IN ('admin', 'coach'))
  );

-- Registration form reads active pricing rules to show applicable discounts.
CREATE POLICY "public_read_active_rules" ON public.event_pricing_rules
  FOR SELECT TO anon, authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.events WHERE id = event_pricing_rules.event_id AND status = 'published'
    )
  );

COMMENT ON TABLE  public.event_pricing_rules IS 'Dynamic pricing rules (group, corporate, tiered, referral) per event.';
COMMENT ON COLUMN public.event_pricing_rules.discount_value IS 'INR amount for flat discounts; percentage points (1-100) for percent discounts.';
COMMENT ON COLUMN public.event_pricing_rules.uses_count IS 'Incremented atomically each time the rule is applied at checkout.';
