-- ── Birthday feed posts and privacy settings ──────────────────────────────────
-- Adds birthday_privacy + birthday_post_sent to users.
-- Adds location_id to user_posts for birthday location-based filtering.
-- Expands post_type CHECK to include 'birthday'.

-- User privacy and dedup columns
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS birthday_privacy   TEXT NOT NULL DEFAULT 'community'
    CHECK (birthday_privacy IN ('community', 'hidden')),
  ADD COLUMN IF NOT EXISTS birthday_post_sent DATE;

-- location_id on user_posts (birthday posts are scoped to a training location)
ALTER TABLE public.user_posts
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.training_locations(id) ON DELETE SET NULL;

-- Expand post_type to include 'birthday'
ALTER TABLE public.user_posts DROP CONSTRAINT IF EXISTS user_posts_post_type_check;
ALTER TABLE public.user_posts ADD CONSTRAINT user_posts_post_type_check
  CHECK (post_type IN ('general', 'run', 'achievement', 'race', 'question', 'birthday'));

-- Index for fast birthday post lookups by location
CREATE INDEX IF NOT EXISTS user_posts_birthday_location_idx
  ON public.user_posts (location_id, created_at DESC)
  WHERE post_type = 'birthday' AND approved = true;

-- Default app_settings for birthday feed posts
INSERT INTO public.app_settings (key, value) VALUES
  ('birthday_post_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
