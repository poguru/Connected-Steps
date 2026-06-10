CREATE TABLE IF NOT EXISTS user_achievements (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email text        NOT NULL,
  badge_id   text        NOT NULL,
  earned_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_email, badge_id)
);

CREATE INDEX IF NOT EXISTS user_achievements_email_idx ON user_achievements (user_email);
