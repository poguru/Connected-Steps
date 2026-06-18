-- ============================================================
-- Connected Steps — Coach Messaging Tables
-- File: 20260618000004_coach_messaging.sql
-- Date: 2026-06-18
--
-- Creates the messaging system tables if they don't exist yet,
-- adds is_admin column to coaches, and creates the
-- coach_assignments table for the new assignment-based model.
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- ============================================================

-- ── coaches ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coaches (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  email          TEXT        NOT NULL UNIQUE,
  specialization TEXT,
  avatar_url     TEXT,
  bio            TEXT,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  is_admin       BOOLEAN     NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add is_admin if the table already existed without it
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coaches' AND policyname = 'coaches_public_read'
  ) THEN
    CREATE POLICY coaches_public_read ON public.coaches FOR SELECT USING (is_active = true);
  END IF;
END $$;

-- ── conversations ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email           TEXT        NOT NULL,
  coach_id             UUID        NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  last_message_at      TIMESTAMPTZ,
  last_message_preview TEXT,
  user_unread          INTEGER     NOT NULL DEFAULT 0,
  coach_unread         INTEGER     NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_email, coach_id)
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'conversations' AND policyname = 'conversations_service_all'
  ) THEN
    CREATE POLICY conversations_service_all ON public.conversations FOR ALL USING (true);
  END IF;
END $$;

-- ── messages ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_email    TEXT        NOT NULL,
  sender_type     TEXT        NOT NULL CHECK (sender_type IN ('user', 'coach')),
  body            TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at         TIMESTAMPTZ
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'messages' AND policyname = 'messages_service_all'
  ) THEN
    CREATE POLICY messages_service_all ON public.messages FOR ALL USING (true);
  END IF;
END $$;

-- ── coach_assignments ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_assignments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  TEXT        NOT NULL,
  coach_id    UUID        NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  assigned_by TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  UNIQUE(user_email, coach_id)
);

ALTER TABLE public.coach_assignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coach_assignments' AND policyname = 'coach_assignments_service_all'
  ) THEN
    CREATE POLICY coach_assignments_service_all ON public.coach_assignments FOR ALL USING (true);
  END IF;
END $$;

-- ── Seed coaches ──────────────────────────────────────────────────────────────
-- is_admin = true  → always visible to every user (Admin inbox)
-- is_admin = false → only visible when assigned to that user
INSERT INTO public.coaches (name, email, specialization, is_admin) VALUES
  ('Admin',                'admin@connectedsteps.in',   'Head Coach',                          true),
  ('Training Team',        'training@connectedsteps.in','Training Support',                    true),
  ('Ashokan K',            'ashokan@connectedsteps.in', 'Head Athletics & Conditioning Coach', false),
  ('Durga Rao Vana',       'durga@connectedsteps.in',   'Marathon Coach',                      false),
  ('Achyuta Kumari Kolli', 'achyuta@connectedsteps.in', 'Sprint & Strength Coach',             false)
ON CONFLICT (email) DO NOTHING;

-- Ensure system coaches are flagged correctly even if rows already existed
UPDATE public.coaches
SET is_admin = true
WHERE email IN ('admin@connectedsteps.in', 'training@connectedsteps.in');
