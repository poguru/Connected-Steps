-- ============================================================
-- Connected Steps — Coach Profiles Table
-- File: 20260610000009_coach_profiles.sql
-- Date: 2026-06-11
--
-- Creates the coach_profiles table for database-driven coach
-- content. Pre-seeds with the three coaches currently hardcoded
-- in lib/coach-data.ts so both sources stay in sync.
--
-- Safe to re-run: all inserts use ON CONFLICT DO NOTHING.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.coach_profiles (
  slug             TEXT        PRIMARY KEY,
  name             TEXT        NOT NULL,
  role             TEXT        NOT NULL DEFAULT '',
  location         TEXT        NOT NULL DEFAULT '',
  email            TEXT        NOT NULL,
  photo            TEXT,
  initials         TEXT        NOT NULL DEFAULT '',
  bio              TEXT        NOT NULL DEFAULT '',
  -- [{icon: string, text: string}]
  qualifications   JSONB       NOT NULL DEFAULT '[]',
  -- [string]
  certifications   JSONB       NOT NULL DEFAULT '[]',
  -- [{icon: string, text: string}]  (medals / athletic achievements)
  experience       JSONB       NOT NULL DEFAULT '[]',
  -- [string]  (areas of focus, for future use)
  specializations  JSONB       NOT NULL DEFAULT '[]',
  -- [{name: string, goal: string, quote: string}]
  testimonials     JSONB       NOT NULL DEFAULT '[]',
  sessions_coached INTEGER     NOT NULL DEFAULT 0,
  instagram        TEXT,
  sort_order       INTEGER     NOT NULL DEFAULT 0,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.coach_profiles ENABLE ROW LEVEL SECURITY;

-- Public can read active profiles; writes go through service role only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'coach_profiles'
      AND policyname = 'coach_profiles_public_read'
  ) THEN
    CREATE POLICY coach_profiles_public_read
      ON public.coach_profiles
      FOR SELECT
      USING (is_active = true);
  END IF;
END$$;

-- ── Seed: Ashokan K ──────────────────────────────────────────────────────────
INSERT INTO public.coach_profiles (
  slug, name, role, location, email, photo, initials, bio,
  qualifications, certifications, experience, specializations, testimonials,
  sessions_coached, instagram, sort_order
) VALUES (
  'ashokan-k',
  'Ashokan K',
  'Head Athletics & Conditioning Coach',
  'Secunderabad',
  'ashokan@connectedsteps.in',
  '/coaches/ashokan-k.jpg',
  'AK',
  'Former Army athlete turned elite coach with over 25 years of experience. NIS Patiala certified, National Gold Medallist (1999) and three-time Services Gold Medallist. Has coached CWG Bronze medallist Harminder Singh and multiple national-level athletes across Andhra Pradesh, Tamil Nadu, Karnataka and Kerala.',
  '[
    {"icon":"🎓","text":"NIS Diploma – National Institute of Sports, Patiala (2007–08)"},
    {"icon":"🎓","text":"Bachelor of Arts (BA), Hyderabad"}
  ]'::jsonb,
  '[
    "Athletics & Conditioning Coach – AOC Centre, Army Ordnance Corps",
    "Coached state teams in AP, Tamil Nadu, Karnataka & Kerala",
    "South Command, Army Green & Army Node teams coach"
  ]'::jsonb,
  '[
    {"icon":"🥇","text":"National Gold Medallist 1999"},
    {"icon":"🥇","text":"Services Gold Medallist 1998, 1999 & 2000"},
    {"icon":"🏅","text":"Coached CWG Bronze medallist Harminder Singh (20km Race Walk, 2010)"}
  ]'::jsonb,
  '[]'::jsonb,
  '[
    {"name":"Rajesh M.","goal":"Completed first half-marathon","quote":"Coach Ashokan''s military discipline and technical depth transformed my running form completely. From a casual jogger to a half-marathon finisher in 12 weeks."},
    {"name":"Priya S.","goal":"Sub-60 minute 10K","quote":"His conditioning drills are tough but they work. I hit my 10K goal two months ahead of schedule. The attention to detail is unmatched."},
    {"name":"Vikram R.","goal":"Injury recovery & return to running","quote":"After a knee injury, I was afraid to run again. Coach Ashokan rebuilt my strength from the ground up. Now I''m training for a full marathon."}
  ]'::jsonb,
  200,
  NULL,
  1
) ON CONFLICT (slug) DO NOTHING;

-- ── Seed: Durga Rao Vana ─────────────────────────────────────────────────────
INSERT INTO public.coach_profiles (
  slug, name, role, location, email, photo, initials, bio,
  qualifications, certifications, experience, specializations, testimonials,
  sessions_coached, instagram, sort_order
) VALUES (
  'durga-rao-vana',
  'Durga Rao Vana',
  'Marathon Coach & Personal Trainer',
  'Hyderabad',
  'durga@connectedsteps.in',
  '/coaches/durga.png',
  'DV',
  'Professional athlete and certified marathon coach with 4 years of experience. Certified by Netaji Subash NIS Bangalore and trained at Sports Authority of India (SAI) Gachibowli. Currently coaching at Connected Steps and TCS Hyderabad. National Games 2022 participant in 1600m at Gujarat.',
  '[
    {"icon":"🎓","text":"Diploma in Strength & Conditioning"},
    {"icon":"🎓","text":"Certified Coach – Netaji Subash National Institute of Sports, Bangalore"},
    {"icon":"🎓","text":"Trained at Sports Authority of India (SAI), Gachibowli"},
    {"icon":"🎓","text":"Trained at Telangana State Sports School, Medchal"}
  ]'::jsonb,
  '[
    "Marathon Coach – Connected Steps",
    "Personal Trainer – Tata Consultancy Services (TCS), Hyderabad",
    "Coach – Go Alpha Kids",
    "Specialist in Cricket Strength & Conditioning"
  ]'::jsonb,
  '[
    {"icon":"🥇","text":"South Zone Gold – 600m (2017)"},
    {"icon":"🥉","text":"Youth Nationals Bronze – Medley Relay (2019)"},
    {"icon":"🏅","text":"National Games 2022 Participant – 1600m, Gujarat"}
  ]'::jsonb,
  '[]'::jsonb,
  '[
    {"name":"Karthik N.","goal":"First marathon sub-5 hours","quote":"Durga''s marathon-specific plans are detailed yet flexible. He adjusted my training when work got busy without losing the overall goal. Crossed the finish line with energy to spare."},
    {"name":"Ananya T.","goal":"Lost 6kg and ran her first 10K","quote":"As someone who had never run before, I was nervous. Durga started me slow and built me up week by week. Three months later I ran a 10K — I still can''t believe it."},
    {"name":"Suresh P.","goal":"Improved marathon PB by 28 minutes","quote":"The strength work Durga built into my plan made the difference in the final 10km. Best improvement I''ve seen in 5 years of running."}
  ]'::jsonb,
  150,
  '@trainer_durga',
  2
) ON CONFLICT (slug) DO NOTHING;

-- ── Seed: Achyuta Kumari Kolli ───────────────────────────────────────────────
INSERT INTO public.coach_profiles (
  slug, name, role, location, email, photo, initials, bio,
  qualifications, certifications, experience, specializations, testimonials,
  sessions_coached, instagram, sort_order
) VALUES (
  'achyuta-kumari-kolli',
  'Achyuta Kumari Kolli',
  'Sprint & Strength Coach',
  'Hyderabad',
  'achyuta@connectedsteps.in',
  '/coaches/acthutha.jpg',
  'AK',
  'National medalist and professional athlete with a PG Diploma in Strength & Conditioning from Indira Gandhi University. Represented Telangana and Andhra Pradesh in 100m and Long Jump at national level. Currently coaching at TCS Striders Miles and Skechers Running Club.',
  '[
    {"icon":"🎓","text":"PG Diploma – Strength & Conditioning, Sports Coaching (Indira Gandhi University, 2020)"},
    {"icon":"🎓","text":"Bachelor of Arts – Osmania University (2014)"},
    {"icon":"🎓","text":"Bachelor of Physical Education – Currently Pursuing (Siddharth Engineering College)"}
  ]'::jsonb,
  '[
    "Coach – TCS Striders Miles (Feb 2025 – Present)",
    "Strength & Conditioning Coach – Skechers Running Club (Aug 2025 – Present)",
    "Athletic Coach – Delhi Public School, Miyapur (2022–2023)",
    "Fitness Coach – Tightened Global Multi Sports Academy (2021–2022)"
  ]'::jsonb,
  '[
    {"icon":"🥇","text":"8 Gold Medals – National Athletics Championships"},
    {"icon":"🥈","text":"4 Silver Medals – National Athletics Championships"},
    {"icon":"🥉","text":"5 Bronze Medals – National Athletics Championships"}
  ]'::jsonb,
  '[]'::jsonb,
  '[
    {"name":"Meena K.","goal":"Faster 5K time","quote":"Achyuta''s sprint drills changed how I run entirely. I shaved 3 minutes off my 5K in 8 weeks. Her own athletic background means she knows exactly what to fix."},
    {"name":"Aditya V.","goal":"Injury-free season","quote":"Her strength programming is surgical — she pinpointed exactly which muscle weaknesses were causing my recurring calf strain. Pain-free for 6 months now."},
    {"name":"Lakshmi R.","goal":"Speed improvement at 40","quote":"I didn''t think I could get faster at 40. Achyuta proved me completely wrong. Her energy and belief in every athlete is contagious."}
  ]'::jsonb,
  120,
  NULL,
  3
) ON CONFLICT (slug) DO NOTHING;
