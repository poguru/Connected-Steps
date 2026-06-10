-- ============================================================
-- Connected Steps — Community User Posts
-- File: 20260610000005_user_posts.sql
-- Date: 2026-06-10
--
-- Separate from community_posts (homepage Q&A).
-- user_posts = social-feed style posts with photos, reactions, comments.
--
-- Storage: create a public bucket called 'user-posts' in Supabase
-- Dashboard → Storage → New bucket → Name: user-posts, Public: true
-- ============================================================

-- ── Main posts ────────────────────────────────────────────────────────────────

CREATE TABLE user_posts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_email text        NOT NULL,
  author_name  text        NOT NULL,
  post_type    text        NOT NULL DEFAULT 'general',
  -- 'general' | 'run' | 'achievement' | 'race' | 'question'
  body         text        NOT NULL CHECK (char_length(body) <= 800),
  photo_url    text,
  approved     boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_posts_author_idx    ON user_posts (author_email, created_at DESC);
CREATE INDEX user_posts_approved_idx  ON user_posts (approved, created_at DESC);

-- ── Comments ──────────────────────────────────────────────────────────────────

CREATE TABLE user_post_comments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      uuid        NOT NULL REFERENCES user_posts(id) ON DELETE CASCADE,
  author_email text        NOT NULL,
  author_name  text        NOT NULL,
  body         text        NOT NULL CHECK (char_length(body) <= 400),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_post_comments_post_idx ON user_post_comments (post_id, created_at ASC);

-- ── Reactions (like / celebrate) ─────────────────────────────────────────────

CREATE TABLE user_post_likes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       uuid        NOT NULL REFERENCES user_posts(id) ON DELETE CASCADE,
  user_email    text        NOT NULL,
  reaction_type text        NOT NULL DEFAULT 'like' CHECK (reaction_type IN ('like','celebrate')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_email)
);

CREATE INDEX user_post_likes_post_idx ON user_post_likes (post_id);

-- ── Content reports ───────────────────────────────────────────────────────────

CREATE TABLE content_reports (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_email text        NOT NULL,
  content_type   text        NOT NULL, -- 'user_post' | 'user_post_comment'
  content_id     text        NOT NULL,
  reason         text        NOT NULL DEFAULT 'inappropriate',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX content_reports_content_idx ON content_reports (content_type, content_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE user_posts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_post_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_reports    ENABLE ROW LEVEL SECURITY;

-- Approved posts and comments are publicly readable
CREATE POLICY user_posts_anon_select
  ON user_posts FOR SELECT TO anon USING (approved = true);

CREATE POLICY user_post_comments_anon_select
  ON user_post_comments FOR SELECT TO anon USING (true);

CREATE POLICY user_post_likes_anon_select
  ON user_post_likes FOR SELECT TO anon USING (true);
-- content_reports: no anon access (service role only)
