-- ============================================================
-- Connected Steps - The IT Run Sprint-2 Schema
-- File: 20260718000001_it_run_sprint2.sql
-- Date: 2026-07-18
--
-- Tables created:
--   it_run_events               - Event configuration
--   it_run_categories           - Race categories with pricing
--   it_run_coupons              - Discount coupons
--   it_run_coupon_uses          - Coupon redemption log
--   it_run_registrations        - One per booking (may cover 1-2 participants)
--   it_run_participants         - One per person (linked to registration)
--   it_run_company_verifications- Verification log per participant
--   it_run_bib_slots            - BIB collection time slots
--   it_run_bib_bookings         - Participant slot bookings
--   it_run_bib_collections      - Actual BIB collection records
--   it_run_checkins             - Race-day check-in records
--   it_run_portal_users         - Event-specific portal staff
--
-- All tables have RLS enabled. Service role bypasses RLS.
-- Anon and authenticated roles have no access by default.
-- ============================================================

-- ── Events ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS it_run_events (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                   TEXT        UNIQUE NOT NULL,
  title                  TEXT        NOT NULL,
  subtitle               TEXT,
  tagline                TEXT,
  event_date             DATE        NOT NULL,
  report_time            TEXT,
  flag_off_time          TEXT,
  venue_name             TEXT,
  venue_address          TEXT,
  city                   TEXT,
  maps_url               TEXT,
  registration_opens_at  TIMESTAMPTZ,
  registration_closes_at TIMESTAMPTZ,
  status                 TEXT        NOT NULL DEFAULT 'upcoming'
                         CHECK (status IN ('draft','upcoming','active','closed','completed','cancelled')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Race categories ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS it_run_categories (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             UUID        NOT NULL REFERENCES it_run_events(id) ON DELETE CASCADE,
  slug                 TEXT        NOT NULL,
  name                 TEXT        NOT NULL,
  distance_km          NUMERIC(4,1),
  category_type        TEXT        NOT NULL DEFAULT 'solo'
                       CHECK (category_type IN ('solo','duo','kid')),
  price_rupees         INTEGER     NOT NULL,
  early_bird_price     INTEGER,
  early_bird_ends_at   TIMESTAMPTZ,
  includes_bib         BOOLEAN     NOT NULL DEFAULT true,
  includes_timing      BOOLEAN     NOT NULL DEFAULT false,
  includes_medal       BOOLEAN     NOT NULL DEFAULT false,
  includes_tshirt      BOOLEAN     NOT NULL DEFAULT true,
  includes_certificate BOOLEAN     NOT NULL DEFAULT true,
  max_participants     INTEGER,
  current_participants INTEGER     NOT NULL DEFAULT 0,
  is_active            BOOLEAN     NOT NULL DEFAULT true,
  sort_order           INTEGER     NOT NULL DEFAULT 0,
  description          TEXT,
  color                TEXT        DEFAULT '#e8620a',
  UNIQUE(event_id, slug)
);

-- ── Coupons ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS it_run_coupons (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID        NOT NULL REFERENCES it_run_events(id) ON DELETE CASCADE,
  code           TEXT        NOT NULL,
  description    TEXT,
  discount_type  TEXT        NOT NULL CHECK (discount_type IN ('flat','percent')),
  discount_value NUMERIC(10,2) NOT NULL,
  max_uses       INTEGER,
  use_count      INTEGER     NOT NULL DEFAULT 0,
  min_amount     INTEGER,
  expires_at     TIMESTAMPTZ,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, code)
);

-- ── Registrations (one per booking) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS it_run_registrations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID        NOT NULL REFERENCES it_run_events(id),
  category_id         UUID        NOT NULL REFERENCES it_run_categories(id),
  registration_code   TEXT        UNIQUE NOT NULL,
  lead_email          TEXT        NOT NULL,
  participant_count   INTEGER     NOT NULL DEFAULT 1,
  base_price          INTEGER     NOT NULL,
  discount_amount     INTEGER     NOT NULL DEFAULT 0,
  final_price         INTEGER     NOT NULL,
  coupon_id           UUID        REFERENCES it_run_coupons(id),
  payment_status      TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (payment_status IN ('pending','paid','failed','free')),
  razorpay_order_id   TEXT,
  razorpay_payment_id TEXT,
  qr_token            TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Participants (one per person) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS it_run_participants (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id     UUID        NOT NULL REFERENCES it_run_registrations(id) ON DELETE CASCADE,
  event_id            UUID        NOT NULL REFERENCES it_run_events(id),
  participant_type    TEXT        NOT NULL DEFAULT 'solo'
                      CHECK (participant_type IN ('solo','primary','secondary','parent','child')),
  first_name          TEXT        NOT NULL,
  last_name           TEXT        NOT NULL,
  gender              TEXT        NOT NULL
                      CHECK (gender IN ('male','female','other','prefer_not')),
  dob                 DATE,
  email               TEXT,
  mobile              TEXT        NOT NULL,
  blood_group         TEXT,
  emergency_name      TEXT,
  emergency_phone     TEXT,
  company_name        TEXT,
  employee_id         TEXT,
  company_id_url      TEXT,
  tshirt_size         TEXT
                      CHECK (tshirt_size IN ('XS','S','M','L','XL','XXL','3XL')),
  medical_conditions  TEXT,
  food_preference     TEXT
                      CHECK (food_preference IN ('veg','non-veg','vegan') OR food_preference IS NULL),
  bib_number          TEXT,
  wave                TEXT,
  collection_counter  TEXT,
  verification_status TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (verification_status IN ('pending','verified','rejected','need_clarification')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Company verification log ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS it_run_company_verifications (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID        NOT NULL REFERENCES it_run_participants(id) ON DELETE CASCADE,
  status         TEXT        NOT NULL
                 CHECK (status IN ('pending','verified','rejected','need_clarification')),
  reviewer_email TEXT,
  reviewed_at    TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── BIB collection slots ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS it_run_bib_slots (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID        NOT NULL REFERENCES it_run_events(id),
  location_name    TEXT        NOT NULL,
  location_address TEXT,
  slot_date        DATE        NOT NULL,
  start_time       TEXT        NOT NULL,
  end_time         TEXT        NOT NULL,
  capacity         INTEGER     NOT NULL,
  booked_count     INTEGER     NOT NULL DEFAULT 0,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── BIB slot bookings ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS it_run_bib_bookings (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID        NOT NULL REFERENCES it_run_participants(id) ON DELETE CASCADE,
  slot_id        UUID        NOT NULL REFERENCES it_run_bib_slots(id),
  status         TEXT        NOT NULL DEFAULT 'confirmed'
                 CHECK (status IN ('confirmed','cancelled')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(participant_id)
);

-- ── BIB collection records ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS it_run_bib_collections (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID        NOT NULL REFERENCES it_run_participants(id),
  volunteer_email TEXT,
  counter_number TEXT,
  collected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes          TEXT,
  UNIQUE(participant_id)
);

-- ── Race-day check-ins ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS it_run_checkins (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID        NOT NULL REFERENCES it_run_participants(id),
  volunteer_email TEXT,
  checked_in_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(participant_id)
);

-- ── Coupon use log ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS it_run_coupon_uses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id       UUID        NOT NULL REFERENCES it_run_coupons(id),
  registration_id UUID        NOT NULL REFERENCES it_run_registrations(id),
  used_by_email   TEXT        NOT NULL,
  used_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(coupon_id, registration_id)
);

-- ── Portal users (event-specific staff) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS it_run_portal_users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        UNIQUE NOT NULL,
  name          TEXT        NOT NULL,
  role          TEXT        NOT NULL
                CHECK (role IN ('event_admin','verification_team','bib_collection','checkin_team','support_desk')),
  password_hash TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_itr_reg_event_status     ON it_run_registrations(event_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_itr_reg_lead_email       ON it_run_registrations(lead_email);
CREATE INDEX IF NOT EXISTS idx_itr_reg_order_id         ON it_run_registrations(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_itr_part_reg_id          ON it_run_participants(registration_id);
CREATE INDEX IF NOT EXISTS idx_itr_part_event_bib       ON it_run_participants(event_id, bib_number);
CREATE INDEX IF NOT EXISTS idx_itr_part_email           ON it_run_participants(email);
CREATE INDEX IF NOT EXISTS idx_itr_part_mobile          ON it_run_participants(mobile);
CREATE INDEX IF NOT EXISTS idx_itr_part_verification    ON it_run_participants(event_id, verification_status);
CREATE INDEX IF NOT EXISTS idx_itr_slots_event_date     ON it_run_bib_slots(event_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_itr_bookings_slot        ON it_run_bib_bookings(slot_id);
CREATE INDEX IF NOT EXISTS idx_itr_verif_participant    ON it_run_company_verifications(participant_id, status);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE it_run_events               ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_run_categories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_run_coupons              ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_run_registrations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_run_participants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_run_company_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_run_bib_slots            ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_run_bib_bookings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_run_bib_collections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_run_checkins             ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_run_coupon_uses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_run_portal_users         ENABLE ROW LEVEL SECURITY;

-- Public read-only for landing page data (events + categories)
CREATE POLICY "itr_public_read_events"     ON it_run_events     FOR SELECT USING (true);
CREATE POLICY "itr_public_read_categories" ON it_run_categories FOR SELECT USING (is_active = true);
CREATE POLICY "itr_public_read_slots"      ON it_run_bib_slots  FOR SELECT USING (is_active = true);

-- Service role (used by API routes) bypasses RLS - no additional policies needed
-- Anon role has no write access to any table

-- ── Seed data: The IT Run Sprint-2 ────────────────────────────────────────────

INSERT INTO it_run_events (
  slug, title, subtitle, tagline,
  event_date, report_time, flag_off_time,
  venue_name, venue_address, city,
  registration_closes_at, status
) VALUES (
  'sprint-2',
  'The IT Run Sprint-2',
  'Exclusive for IT Professionals',
  'Your Code Compiles. Now Run It.',
  '2026-08-17',
  '05:30 AM',
  '06:00 AM',
  'Hitec City Marathon Start Point',
  'Hitech City Road, HITEC City, Hyderabad, Telangana 500081',
  'Hyderabad',
  '2026-08-10 23:59:59+05:30',
  'upcoming'
) ON CONFLICT (slug) DO NOTHING;

-- Race categories (seeded with the event)
WITH ev AS (SELECT id FROM it_run_events WHERE slug = 'sprint-2' LIMIT 1)
INSERT INTO it_run_categories (
  event_id, slug, name, distance_km, category_type,
  price_rupees, includes_timing, includes_medal, sort_order, description, color
)
SELECT
  ev.id, v.slug, v.name, v.dist, v.ctype,
  v.price, v.timing, v.medal, v.sord, v.descr, v.clr
FROM ev,
(VALUES
  ('10k-timed',  '10K Timed Run',       10.0, 'solo', 799, true,  true,  1, 'Flagship race with chip timing, finisher medal and certificate', '#e8620a'),
  ('5k-timed',   '5K Timed Run',         5.0, 'solo', 599, true,  true,  2, 'Competitive 5K with chip timing and finisher medal',            '#f97316'),
  ('5k-fun-run', '5K Fun Run',           5.0, 'solo', 399, false, false, 3, 'Casual 5K run - no pressure, all fun and community vibes',      '#10b981'),
  ('5k-duo',     '5K Duo Challenge',     5.0, 'duo',  999, false, false, 4, 'Run with your work buddy - one price covers both runners',       '#6366f1'),
  ('1-5k-kid',   '1.5K Run with Kid',    1.5, 'kid',  299, false, false, 5, 'Run with your child (age 10 or under) - price for parent + child', '#ec4899')
) AS v(slug, name, dist, ctype, price, timing, medal, sord, descr, clr)
ON CONFLICT (event_id, slug) DO NOTHING;

-- Seed BIB collection slots
WITH ev AS (SELECT id FROM it_run_events WHERE slug = 'sprint-2' LIMIT 1)
INSERT INTO it_run_bib_slots (event_id, location_name, location_address, slot_date, start_time, end_time, capacity)
SELECT ev.id, v.loc, v.addr, v.dt::DATE, v.st, v.et, v.cap
FROM ev,
(VALUES
  ('Connected Steps Studio - Miyapur',   'SVR Homes, 3rd Floor, Miyapur, Hyderabad', '2026-08-14', '08:00 AM', '01:00 PM', 100),
  ('Connected Steps Studio - Miyapur',   'SVR Homes, 3rd Floor, Miyapur, Hyderabad', '2026-08-14', '03:00 PM', '08:00 PM', 100),
  ('Connected Steps Studio - Miyapur',   'SVR Homes, 3rd Floor, Miyapur, Hyderabad', '2026-08-15', '08:00 AM', '01:00 PM', 100),
  ('Connected Steps Studio - Miyapur',   'SVR Homes, 3rd Floor, Miyapur, Hyderabad', '2026-08-15', '03:00 PM', '08:00 PM', 100),
  ('Hitec City Collection Counter',      'HITEC City, Cyberabad, Hyderabad',          '2026-08-16', '10:00 AM', '06:00 PM', 200)
) AS v(loc, addr, dt, st, et, cap)
ON CONFLICT DO NOTHING;

-- ── Trigger: auto-update updated_at ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION itr_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER itr_reg_updated_at
  BEFORE UPDATE ON it_run_registrations
  FOR EACH ROW EXECUTE FUNCTION itr_set_updated_at();

-- ── Atomic BIB slot booking (prevents race conditions) ────────────────────────

CREATE OR REPLACE FUNCTION itr_book_bib_slot(
  p_participant_id UUID,
  p_slot_id        UUID
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_slot      RECORD;
  v_existing  UUID;
BEGIN
  -- Check for existing booking
  SELECT id INTO v_existing
  FROM it_run_bib_bookings
  WHERE participant_id = p_participant_id AND status = 'confirmed';

  IF v_existing IS NOT NULL THEN
    RETURN 'already_booked';
  END IF;

  -- Lock and check capacity
  SELECT id, capacity, booked_count INTO v_slot
  FROM it_run_bib_slots
  WHERE id = p_slot_id AND is_active = true
  FOR UPDATE;

  IF v_slot IS NULL THEN
    RETURN 'slot_not_found';
  END IF;

  IF v_slot.booked_count >= v_slot.capacity THEN
    RETURN 'full';
  END IF;

  -- Insert booking
  INSERT INTO it_run_bib_bookings (participant_id, slot_id, status)
  VALUES (p_participant_id, p_slot_id, 'confirmed')
  ON CONFLICT (participant_id) DO UPDATE SET slot_id = p_slot_id, status = 'confirmed';

  -- Increment counter
  UPDATE it_run_bib_slots
  SET booked_count = booked_count + 1
  WHERE id = p_slot_id;

  RETURN 'confirmed';
END;
$$;
