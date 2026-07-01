-- ============================================================
-- Connected Steps — Membership Plans
-- File: 20260701000003_membership_plans.sql
-- Date: 2026-07-01
-- ============================================================
-- Replaces hard-coded pricing on the /pricing page with a
-- database-driven plan configuration that admins can update
-- without a code deploy.
-- ============================================================

-- ── 1. Table ─────────────────────────────────────────────────────────────────

create table if not exists membership_plans (
  id              uuid        primary key default gen_random_uuid(),

  -- Identity
  name            text        not null,
  slug            text        not null unique,           -- e.g. "community", "coaching", "corporate"
  tagline         text,                                  -- short line under name
  description     text,                                  -- paragraph shown on card

  -- Pricing
  price           numeric(10, 2),                        -- null → contact-only
  currency        text        not null default 'INR',
  billing_label   text,                                  -- "per month", "custom", etc.

  -- Razorpay plan id (maps to existing payment flow)
  razorpay_plan   text,                                  -- e.g. "monthly", "quarterly" — passed to /api/payment/create-order

  -- Features displayed as bullet list (ordered array of strings)
  features        jsonb       not null default '[]',

  -- CTA
  cta_label       text        not null default 'Get Started',
  cta_href        text,                                  -- external link; null → open Razorpay

  -- Flags
  is_active       boolean     not null default true,
  is_featured     boolean     not null default false,    -- highlight card
  is_contact_only boolean     not null default false,    -- hide price, show "Contact Us"

  -- Display
  display_order   integer     not null default 0,
  badge_label     text,                                  -- badge text e.g. "Most Popular"
  color_accent    text        not null default 'orange', -- orange | green | blue

  -- Audit
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists membership_plans_active_order_idx
  on membership_plans (is_active, display_order);

-- ── 2. Auto-update updated_at ─────────────────────────────────────────────────

create or replace function touch_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_membership_plans_updated_at on membership_plans;
create trigger trg_membership_plans_updated_at
  before update on membership_plans
  for each row execute function touch_updated_at();

-- ── 3. RLS ───────────────────────────────────────────────────────────────────

alter table membership_plans enable row level security;

-- Anyone can read active plans (public pricing page)
create policy "membership_plans_public_read"
  on membership_plans for select
  using (is_active = true);

-- Service role (admin API) can do anything
create policy "membership_plans_service_all"
  on membership_plans for all
  using (auth.role() = 'service_role');

-- ── 4. Seed — Connected Steps' actual plans ───────────────────────────────────
-- Prices are left NULL so admins set them via the dashboard without a migration.
-- Set `price` in the admin panel once the page goes live.

insert into membership_plans
  (name, slug, tagline, description, price, billing_label, razorpay_plan, features,
   cta_label, cta_href, is_featured, is_contact_only, display_order, badge_label, color_accent)
values
  (
    'Community Membership',
    'community',
    'Run with the community',
    'Join Hyderabad''s growing running community. Attend weekly sessions, track your progress, climb the leaderboard, and find your running tribe.',
    null,           -- admin sets the price
    'per month',
    'monthly',      -- maps to existing Razorpay plan key
    '[
      "Weekly community running sessions",
      "Community WhatsApp group",
      "Attendance tracking & points",
      "Leaderboard participation",
      "Achievement badges",
      "Event updates & invitations",
      "Community feed access",
      "Session reminders",
      "Mobile app access"
    ]'::jsonb,
    'Join Community',
    null,           -- opens Razorpay
    true,           -- featured / highlighted
    false,
    1,
    'Most Popular',
    'orange'
  ),
  (
    'Personal Coaching',
    'coaching',
    'Train smarter, not just harder',
    'A premium one-to-one coaching program tailored to your exact goal — whether it''s your first 5K or a sub-4 marathon.',
    null,           -- admin sets the price
    'per month',
    null,           -- coaching uses a different payment/enquiry flow
    '[
      "Personalised weekly training plan",
      "One-to-one coach sessions",
      "Performance tracking & analytics",
      "Goal-based programming",
      "Weekly coach feedback",
      "Progress monitoring",
      "Priority WhatsApp support",
      "All Community Membership benefits"
    ]'::jsonb,
    'Get Started',
    null,
    false,
    false,
    2,
    null,
    'orange'
  ),
  (
    'Corporate Wellness',
    'corporate',
    'Invest in your team''s health',
    'Structured wellness programmes designed for organisations — from desk mobility sessions to full marathon preparation. Custom pricing based on team size.',
    null,
    null,
    null,
    '[
      "Desk Mobility & Stretching Sessions",
      "Guided Running Programs",
      "Wellness Challenges & Competitions",
      "Marathon Preparation Plans",
      "Team Building Activities",
      "Employee Health & Fitness Tracking",
      "Dedicated Corporate Coordinator",
      "Custom reporting & analytics"
    ]'::jsonb,
    'Request Proposal',
    'mailto:corporate@connectedsteps.in',
    false,
    true,           -- contact-only — no price shown
    3,
    'Business',
    'blue'
  )
on conflict (slug) do nothing;
