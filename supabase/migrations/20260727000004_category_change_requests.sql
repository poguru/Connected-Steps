-- Phase 4: User-Facing Category Change
-- Tracks requests to change a registration's distance category.
-- Users submit requests; admins approve or reject them.
-- On approval, the application code updates event_registrations and event_participants.

CREATE TABLE IF NOT EXISTS public.category_change_requests (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id     UUID        NOT NULL REFERENCES public.event_registrations(id) ON DELETE CASCADE,
  event_id            UUID        NOT NULL REFERENCES public.events(id)               ON DELETE CASCADE,
  requested_by_email  TEXT        NOT NULL,
  old_category        TEXT        NOT NULL,
  new_category        TEXT        NOT NULL,
  reason              TEXT,
  status              TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by         TEXT,
  reviewed_at         TIMESTAMPTZ,
  admin_note          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cat_change_event_idx    ON public.category_change_requests (event_id, status);
CREATE INDEX IF NOT EXISTS cat_change_reg_idx      ON public.category_change_requests (registration_id);
CREATE INDEX IF NOT EXISTS cat_change_email_idx    ON public.category_change_requests (requested_by_email);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.category_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cat_change_service_all"
  ON public.category_change_requests FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "cat_change_admins_manage"
  ON public.category_change_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE email = auth.email()
      AND role IN ('admin', 'coach')
    )
  );

-- Users can read their own requests
CREATE POLICY "cat_change_user_read_own"
  ON public.category_change_requests FOR SELECT
  USING (requested_by_email = auth.email());

-- Users can insert their own requests
CREATE POLICY "cat_change_user_insert_own"
  ON public.category_change_requests FOR INSERT
  WITH CHECK (requested_by_email = auth.email());
