-- ── Session photos & activity feed migration ─────────────────────────────────
-- Run in Supabase SQL Editor > New Query

-- 1. User-uploaded session photos (multiple per session)
create table if not exists session_photos (
  id              uuid primary key default gen_random_uuid(),
  session_id      text not null,
  uploader_email  text not null,
  uploader_name   text,
  photo_url       text not null,
  caption         text,
  created_at      timestamptz default now()
);

create index if not exists session_photos_session_idx  on session_photos (session_id);
create index if not exists session_photos_uploader_idx on session_photos (uploader_email);

-- 2. Photo likes
create table if not exists photo_likes (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references session_photos(id) on delete cascade,
  user_email  text not null,
  created_at  timestamptz default now(),
  unique (photo_id, user_email)
);

-- 3. Enable Realtime on session_photos (optional but useful)
alter publication supabase_realtime add table session_photos;

-- 4. RLS
alter table session_photos enable row level security;
alter table photo_likes     enable row level security;

create policy "anon_read_session_photos" on session_photos for select using (true);
create policy "anon_read_photo_likes"    on photo_likes    for select using (true);
