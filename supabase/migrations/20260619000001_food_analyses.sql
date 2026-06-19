-- ============================================================
-- Connected Steps — AI Food Analyzer
-- File: 20260619000001_food_analyses.sql
-- Date: 2026-06-19
--
-- Creates food_analyses table for storing AI nutritional
-- analysis results. RLS enabled — service role only (all
-- access is via API routes using the service role key).
-- Safe to re-run: uses IF NOT EXISTS.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.food_analyses (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email           TEXT        NOT NULL,
  image_data           TEXT,                           -- compressed base64 thumbnail for history display
  detected_foods       JSONB       NOT NULL DEFAULT '[]',
  nutrition            JSONB       NOT NULL DEFAULT '{}',
  health_score         INTEGER,
  health_grade         TEXT,
  health_grade_reason  TEXT,
  healthy_ingredients  JSONB       NOT NULL DEFAULT '[]',
  concerns             JSONB       NOT NULL DEFAULT '[]',
  goal_recommendation  JSONB,
  missing_nutrients    JSONB       NOT NULL DEFAULT '[]',
  meal_type            TEXT,                           -- breakfast / lunch / dinner / snack
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.food_analyses ENABLE ROW LEVEL SECURITY;

-- All access via service role (API routes). Anon/auth roles have no direct access.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'food_analyses' AND policyname = 'food_analyses_service_all'
  ) THEN
    CREATE POLICY food_analyses_service_all ON public.food_analyses FOR ALL USING (true);
  END IF;
END $$;

-- Index for fast per-user lookups and monthly count queries
CREATE INDEX IF NOT EXISTS food_analyses_user_email_created_at
  ON public.food_analyses (user_email, created_at DESC);
