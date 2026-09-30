-- ── Post-Event Participant Feedback System ────────────────────────────────────
--
-- Two new tables:
--   1. event_feedback          — submitted feedback (one per submitter per event)
--   2. event_feedback_invitations — invitation send tracking (idempotency)
--
-- Architecture note:
--   IT Run uses it_run_events (standalone, no FK to public.events).
--   Generic CS events use public.events.
--   Both systems share event_feedback via separate nullable FK columns.
--   A CHECK constraint ensures exactly one event FK is set per row.
--
-- Both tables:
--   • Use public schema (consistent with all other CS tables)
--   • RLS enabled with service_role_all policy (all access via service role)
--   • Safe to re-run (IF NOT EXISTS guards on all DDL)
--
-- Does NOT alter any existing table.

-- ── 1. event_feedback ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_feedback (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event linkage: exactly one must be set
  event_id            UUID        REFERENCES public.events(id) ON DELETE CASCADE,
  it_run_event_id     UUID        REFERENCES public.it_run_events(id) ON DELETE CASCADE,

  -- Registration linkage — set to the relevant system's registration
  registration_code   TEXT,
  participant_id      UUID        REFERENCES public.it_run_participants(id) ON DELETE SET NULL,
  registration_id     UUID        REFERENCES public.event_registrations(id) ON DELETE SET NULL,

  -- Submitter identity (always set)
  submitter_email     TEXT        NOT NULL,
  submitter_name      TEXT,

  -- Core ratings
  overall_rating      SMALLINT    NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),

  -- Optional category ratings
  organisation_rating SMALLINT    CHECK (organisation_rating BETWEEN 1 AND 5),
  route_rating        SMALLINT    CHECK (route_rating BETWEEN 1 AND 5),
  support_rating      SMALLINT    CHECK (support_rating BETWEEN 1 AND 5),

  -- Qualitative fields
  comment             TEXT        NOT NULL DEFAULT '',
  would_recommend     BOOLEAN,

  -- NPS score (0–10; NULL if not asked)
  nps_score           SMALLINT    CHECK (nps_score BETWEEN 0 AND 10),

  -- Structured improvement tags (whitelist enforced at API layer)
  improvement_areas   TEXT[]      NOT NULL DEFAULT '{}',

  -- Moderation
  is_flagged          BOOLEAN     NOT NULL DEFAULT false,
  is_published        BOOLEAN     NOT NULL DEFAULT true,
  admin_notes         TEXT,

  -- Issue tracking (for admin follow-up on flagged items)
  issue_status        TEXT        NOT NULL DEFAULT 'none'
                      CHECK (issue_status IN ('none', 'open', 'in_progress', 'resolved', 'closed')),
  issue_priority      TEXT        CHECK (issue_priority IN ('low', 'medium', 'high', 'critical')),
  issue_assigned_to   TEXT,
  issue_resolved_at   TIMESTAMPTZ,
  issue_resolution    TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Exactly one event FK must be set
  CONSTRAINT ef_event_xor CHECK (
    (event_id IS NOT NULL AND it_run_event_id IS NULL) OR
    (event_id IS NULL AND it_run_event_id IS NOT NULL)
  )
);

-- Partial unique indexes: one submission per submitter per event (per system)
CREATE UNIQUE INDEX IF NOT EXISTS ef_generic_event_submitter_uniq
  ON public.event_feedback (event_id, submitter_email)
  WHERE event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ef_it_run_event_submitter_uniq
  ON public.event_feedback (it_run_event_id, submitter_email)
  WHERE it_run_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ef_event_idx
  ON public.event_feedback (event_id, created_at DESC)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ef_it_run_event_idx
  ON public.event_feedback (it_run_event_id, created_at DESC)
  WHERE it_run_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ef_submitter_idx
  ON public.event_feedback (submitter_email);

CREATE INDEX IF NOT EXISTS ef_issue_idx
  ON public.event_feedback (it_run_event_id, issue_status)
  WHERE issue_status != 'none';

CREATE INDEX IF NOT EXISTS ef_flagged_idx
  ON public.event_feedback (is_flagged)
  WHERE is_flagged = true;

ALTER TABLE public.event_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ef_service_role_all" ON public.event_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 2. event_feedback_invitations ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_feedback_invitations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event linkage: exactly one must be set (same dual-FK pattern as event_feedback)
  event_id            UUID        REFERENCES public.events(id) ON DELETE CASCADE,
  it_run_event_id     UUID        REFERENCES public.it_run_events(id) ON DELETE CASCADE,

  -- Target participant
  email               TEXT        NOT NULL,
  participant_name    TEXT,
  registration_code   TEXT,

  -- Delivery
  channel             TEXT        NOT NULL DEFAULT 'email'
                      CHECK (channel IN ('email', 'whatsapp')),
  invite_type         TEXT        NOT NULL DEFAULT 'initial'
                      CHECK (invite_type IN ('initial', 'reminder')),

  -- Status tracking
  send_status         TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (send_status IN ('pending', 'sent', 'failed')),
  sent_at             TIMESTAMPTZ,
  error_message       TEXT,

  -- Did they submit feedback after receiving this invite?
  feedback_submitted  BOOLEAN     NOT NULL DEFAULT false,
  feedback_id         UUID        REFERENCES public.event_feedback(id) ON DELETE SET NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Exactly one event FK must be set
  CONSTRAINT efi_event_xor CHECK (
    (event_id IS NOT NULL AND it_run_event_id IS NULL) OR
    (event_id IS NULL AND it_run_event_id IS NOT NULL)
  )
);

-- Idempotency: one invitation record per (event, email, channel, type)
CREATE UNIQUE INDEX IF NOT EXISTS efi_generic_uniq
  ON public.event_feedback_invitations (event_id, email, channel, invite_type)
  WHERE event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS efi_it_run_uniq
  ON public.event_feedback_invitations (it_run_event_id, email, channel, invite_type)
  WHERE it_run_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS efi_it_run_pending_idx
  ON public.event_feedback_invitations (it_run_event_id, send_status)
  WHERE send_status = 'pending';

CREATE INDEX IF NOT EXISTS efi_event_email_idx
  ON public.event_feedback_invitations (it_run_event_id, email);

ALTER TABLE public.event_feedback_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "efi_service_role_all" ON public.event_feedback_invitations
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 3. Auto-update updated_at ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'ef_updated_at'
  ) THEN
    CREATE TRIGGER ef_updated_at
      BEFORE UPDATE ON public.event_feedback
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'efi_updated_at'
  ) THEN
    CREATE TRIGGER efi_updated_at
      BEFORE UPDATE ON public.event_feedback_invitations
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
