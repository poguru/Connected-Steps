-- Events v2: add price, featured, terms, maps columns
-- and create event_registrations table for full registration + payment flow.

ALTER TABLE events ADD COLUMN IF NOT EXISTS price            integer NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS featured         boolean NOT NULL DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS terms_conditions text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS maps_url         text;

CREATE INDEX IF NOT EXISTS idx_events_featured ON events(featured) WHERE featured = true;

-- ── event_registrations ──────────────────────────────────────────────────────
-- One row per user per event. Holds profile snapshot, coupon, and payment info.

CREATE TABLE IF NOT EXISTS event_registrations (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_code     text        UNIQUE NOT NULL,   -- e.g. CS-EVT-XK9M4R
  event_id              uuid        NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  user_email            text        NOT NULL,
  user_name             text        NOT NULL,
  phone                 text,
  gender                text,
  date_of_birth         date,
  blood_group           text,
  emergency_contact     text,
  special_notes         text,
  coupon_code           text,
  coupon_id             uuid,
  coupon_discount       integer     NOT NULL DEFAULT 0,  -- discount in rupees
  original_price        integer     NOT NULL DEFAULT 0,  -- event price in rupees
  final_price           integer     NOT NULL DEFAULT 0,  -- after discount
  payment_status        text        NOT NULL DEFAULT 'pending',
  -- pending | free | paid | failed
  razorpay_order_id     text,
  razorpay_payment_id   text,
  razorpay_signature    text,
  status                text        NOT NULL DEFAULT 'confirmed',
  -- confirmed | cancelled | waitlisted
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_email)
);

CREATE INDEX IF NOT EXISTS idx_event_reg_event  ON event_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reg_email  ON event_registrations(user_email);
CREATE INDEX IF NOT EXISTS idx_event_reg_pay    ON event_registrations(payment_status);
CREATE INDEX IF NOT EXISTS idx_event_reg_status ON event_registrations(status);

ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
