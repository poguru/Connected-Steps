-- Add cover_image_url to sessions for admin-curated landscape card cover images.
-- photo_url remains for gallery/legacy use.
-- The card display priority is: cover_image_url > photo_url > prev session photo > gradient.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
