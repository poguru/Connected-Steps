-- ============================================================
-- Connected Steps — BIB Collection Management Phase 3
-- File: 20260626000010_bib_collection_phase3.sql
--
-- Safe additive changes:
--   • ADD COLUMN IF NOT EXISTS (no drops or renames)
--   • New tables: bib_collection_centers, bib_collection_slots,
--     bib_slot_bookings (no FK breakage to existing tables)
--   • Preserves all existing event_registrations behaviour
-- ============================================================


-- ── BIB columns on event_registrations ───────────────────────────────────────

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS bib_number       TEXT,           -- e.g. "5K-042", "001"
  ADD COLUMN IF NOT EXISTS bib_collected_at TIMESTAMPTZ,   -- when BIB was handed over
  ADD COLUMN IF NOT EXISTS bib_collected_by TEXT;          -- volunteer/admin email

-- Unique BIB per event (one participant = one BIB within an event)
CREATE UNIQUE INDEX IF NOT EXISTS event_reg_bib_unique_idx
  ON public.event_registrations (event_id, bib_number)
  WHERE bib_number IS NOT NULL;

-- Fast lookup for BIB scanner
CREATE INDEX IF NOT EXISTS event_reg_bib_number_idx
  ON public.event_registrations (bib_number)
  WHERE bib_number IS NOT NULL;

-- Fast lookup for collection status
CREATE INDEX IF NOT EXISTS event_reg_bib_collected_idx
  ON public.event_registrations (event_id, bib_collected_at)
  WHERE bib_collected_at IS NOT NULL;


-- ── BIB collection centers ────────────────────────────────────────────────────
-- Physical locations where participants collect their BIB packets.

CREATE TABLE IF NOT EXISTS public.bib_collection_centers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  address       TEXT,
  maps_url      TEXT,
  contact_name  TEXT,
  contact_phone TEXT,
  notes         TEXT,
  status        TEXT        NOT NULL DEFAULT 'active',  -- active | inactive
  display_order SMALLINT    NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bib_centers_event_idx
  ON public.bib_collection_centers (event_id, display_order);

ALTER TABLE public.bib_collection_centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.bib_collection_centers
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── BIB collection slots ──────────────────────────────────────────────────────
-- Time slots at each center. Participants book one slot.

CREATE TABLE IF NOT EXISTS public.bib_collection_slots (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id     UUID        NOT NULL REFERENCES public.bib_collection_centers(id) ON DELETE CASCADE,
  event_id      UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  slot_date     DATE        NOT NULL,
  start_time    TEXT        NOT NULL,   -- "09:00"
  end_time      TEXT        NOT NULL,   -- "10:00"
  capacity      INTEGER     NOT NULL DEFAULT 50,
  booked_count  INTEGER     NOT NULL DEFAULT 0,
  status        TEXT        NOT NULL DEFAULT 'active',  -- active | full | cancelled
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bib_slots_center_idx
  ON public.bib_collection_slots (center_id, slot_date, start_time);

CREATE INDEX IF NOT EXISTS bib_slots_event_idx
  ON public.bib_collection_slots (event_id, slot_date);

ALTER TABLE public.bib_collection_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.bib_collection_slots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Participants (anon/authenticated) can read slots for published events
CREATE POLICY "anon_read_active_slots" ON public.bib_collection_slots
  FOR SELECT TO anon, authenticated
  USING (status = 'active' AND EXISTS (
    SELECT 1 FROM public.events WHERE id = bib_collection_slots.event_id AND status = 'published'
  ));


-- ── BIB slot bookings ─────────────────────────────────────────────────────────
-- Each confirmed registration can book exactly one collection slot.

CREATE TABLE IF NOT EXISTS public.bib_slot_bookings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id         UUID        NOT NULL REFERENCES public.bib_collection_slots(id) ON DELETE CASCADE,
  registration_id UUID        NOT NULL REFERENCES public.event_registrations(id) ON DELETE CASCADE,
  event_id        UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_email      TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'confirmed',  -- confirmed | cancelled
  booked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reminder_sent   BOOLEAN     NOT NULL DEFAULT false,
  UNIQUE(registration_id)  -- one slot per registration
);

CREATE INDEX IF NOT EXISTS bib_bookings_slot_idx       ON public.bib_slot_bookings (slot_id);
CREATE INDEX IF NOT EXISTS bib_bookings_event_idx      ON public.bib_slot_bookings (event_id, user_email);
CREATE INDEX IF NOT EXISTS bib_bookings_reminder_idx   ON public.bib_slot_bookings (slot_id)
  WHERE reminder_sent = false AND status = 'confirmed';

ALTER TABLE public.bib_slot_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.bib_slot_bookings
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── Auto-increment booked_count via trigger ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_bib_slot_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'confirmed' THEN
    UPDATE bib_collection_slots SET booked_count = booked_count + 1 WHERE id = NEW.slot_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'confirmed' AND NEW.status <> 'confirmed' THEN
      UPDATE bib_collection_slots SET booked_count = GREATEST(0, booked_count - 1) WHERE id = OLD.slot_id;
    ELSIF OLD.status <> 'confirmed' AND NEW.status = 'confirmed' THEN
      UPDATE bib_collection_slots SET booked_count = booked_count + 1 WHERE id = NEW.slot_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'confirmed' THEN
    UPDATE bib_collection_slots SET booked_count = GREATEST(0, booked_count - 1) WHERE id = OLD.slot_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bib_slot_count ON public.bib_slot_bookings;
CREATE TRIGGER trg_sync_bib_slot_count
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.bib_slot_bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_bib_slot_count();


-- ── Capacity check before booking ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_bib_slot_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cap INT; v_booked INT;
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status <> 'confirmed') THEN
    SELECT capacity, booked_count INTO v_cap, v_booked
    FROM bib_collection_slots WHERE id = NEW.slot_id FOR UPDATE;
    IF v_booked >= v_cap THEN
      RAISE EXCEPTION 'BIB collection slot is full' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_bib_slot_capacity ON public.bib_slot_bookings;
CREATE TRIGGER trg_check_bib_slot_capacity
  BEFORE INSERT OR UPDATE OF status ON public.bib_slot_bookings
  FOR EACH ROW EXECUTE FUNCTION public.check_bib_slot_capacity();
