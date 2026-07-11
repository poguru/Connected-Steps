-- Set actual prices on membership_plans and add quarterly/biannual/annual tiers.
-- Community Monthly was seeded with price=null; add the 4 purchasable billing periods.
-- Personal Coaching and Corporate Wellness remain contact-only (price null).

-- Update Community Monthly with actual price
UPDATE membership_plans
SET
  price         = 1200,
  billing_label = 'per month',
  name          = 'Community — Monthly',
  badge_label   = 'Most Popular'
WHERE slug = 'community';

-- Insert quarterly, biannual, annual tiers (idempotent)
INSERT INTO membership_plans
  (name, slug, tagline, description, price, billing_label, razorpay_plan, features,
   cta_label, cta_href, is_featured, is_contact_only, display_order, badge_label, color_accent)
VALUES
  (
    'Community — 3 Months',
    'community-quarterly',
    'Run with the community',
    'Join Hyderabad''s growing running community. Attend weekly sessions, track your progress, climb the leaderboard, and find your running tribe.',
    3000,
    'per 3 months',
    'quarterly',
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
    'Get Started',
    null,
    false,
    false,
    2,
    'Save ₹600',
    'orange'
  ),
  (
    'Community — 6 Months',
    'community-biannual',
    'Run with the community',
    'Join Hyderabad''s growing running community. Attend weekly sessions, track your progress, climb the leaderboard, and find your running tribe.',
    6000,
    'per 6 months',
    'biannual',
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
    'Get Started',
    null,
    false,
    false,
    3,
    null,
    'orange'
  ),
  (
    'Community — Annual',
    'community-annual',
    'Run with the community',
    'Join Hyderabad''s growing running community. Best value — save ₹3,600 vs monthly. Full year of structured training, community, and coaching.',
    10800,
    'per year',
    'annual',
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
    'Get Started',
    null,
    false,
    false,
    4,
    'Best Value',
    'green'
  )
ON CONFLICT (slug) DO UPDATE SET
  price         = EXCLUDED.price,
  billing_label = EXCLUDED.billing_label,
  razorpay_plan = EXCLUDED.razorpay_plan,
  badge_label   = EXCLUDED.badge_label,
  display_order = EXCLUDED.display_order,
  color_accent  = EXCLUDED.color_accent;

-- Keep Personal Coaching (slug=coaching) at display_order 5
UPDATE membership_plans SET display_order = 5 WHERE slug = 'coaching';

-- Keep Corporate Wellness (slug=corporate) at display_order 6
UPDATE membership_plans SET display_order = 6 WHERE slug = 'corporate';
