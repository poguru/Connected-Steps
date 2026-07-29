-- Corporate wellness: team registrations, company leaderboard, HR export
-- Phase 12 of the Event Management Platform

CREATE TABLE IF NOT EXISTS public.event_corporate_teams (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID        NOT NULL REFERENCES public.events(id)  ON DELETE CASCADE,
  company_name     TEXT        NOT NULL,
  team_name        TEXT        NOT NULL,
  hr_contact_name  TEXT,
  hr_contact_email TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, team_name)
);

ALTER TABLE public.event_corporate_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.event_corporate_teams
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_team_members (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        UUID        NOT NULL REFERENCES public.event_corporate_teams(id) ON DELETE CASCADE,
  participant_id UUID        NOT NULL REFERENCES public.event_participants(id)   ON DELETE CASCADE,
  role           TEXT        NOT NULL DEFAULT 'member'
                             CHECK (role IN ('captain', 'member')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, participant_id)
);

ALTER TABLE public.event_team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.event_team_members
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_corporate_teams_event ON public.event_corporate_teams(event_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team     ON public.event_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_part     ON public.event_team_members(participant_id);
