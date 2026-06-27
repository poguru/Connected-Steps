-- Waitlist for sold-out events.
-- When an event reaches max_participants, users can join the waitlist.
-- Admins can approve waitlisted users, converting them to confirmed registrations.

CREATE TABLE IF NOT EXISTS public.event_waitlist (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_email     TEXT        NOT NULL,
  user_name      TEXT        NOT NULL,
  phone          TEXT,
  distance_category TEXT,
  status         TEXT        NOT NULL DEFAULT 'waiting'
                             CONSTRAINT event_waitlist_status_chk
                             CHECK (status IN ('waiting','approved','rejected','expired')),
  position       INT,                              -- queue position (set on insert)
  notes          TEXT,                             -- participant notes
  approved_at    TIMESTAMPTZ,
  approved_by    TEXT,
  notified_at    TIMESTAMPTZ,                      -- when user was emailed about approval
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_waitlist_unique ON public.event_waitlist (event_id, user_email) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_event_waitlist_event ON public.event_waitlist (event_id, status, created_at);

ALTER TABLE public.event_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.event_waitlist
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Function to auto-assign position on insert
CREATE OR REPLACE FUNCTION public.assign_waitlist_position()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT COALESCE(MAX(position), 0) + 1
    INTO NEW.position
    FROM public.event_waitlist
   WHERE event_id = NEW.event_id AND status = 'waiting';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_waitlist_position ON public.event_waitlist;
CREATE TRIGGER trg_assign_waitlist_position
  BEFORE INSERT ON public.event_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.assign_waitlist_position();

NOTIFY pgrst, 'reload schema';
