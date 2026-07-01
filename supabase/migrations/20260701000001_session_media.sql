-- ============================================================
-- Connected Steps — Session Media (photos + videos)
-- File: 20260701000001_session_media.sql
-- Date: 2026-07-01
-- ============================================================
-- Adds a unified media table for session photos and videos,
-- supporting cover selection, display ordering, and video
-- metadata (duration, dimensions, thumbnail).
--
-- Backward-compatible: sessions.photo_url still works; the
-- cover_media view surfaces the right asset automatically.
-- ============================================================

-- ── 1. Main media table ───────────────────────────────────────────────────────

create table if not exists session_media (
  id              uuid        primary key default gen_random_uuid(),
  session_id      text        not null,
  media_type      text        not null check (media_type in ('image', 'video')),
  url             text        not null,
  thumbnail_url   text,                     -- generated thumb for videos; null = use url
  caption         text,
  duration_secs   integer,                  -- video only
  file_size       bigint,                   -- bytes
  width           integer,
  height          integer,
  display_order   integer     not null default 0,
  is_cover        boolean     not null default false,
  uploader_email  text        not null,
  created_at      timestamptz not null default now()
);

-- Ensure at most one cover per session
create unique index if not exists session_media_one_cover_idx
  on session_media (session_id)
  where is_cover = true;

create index if not exists session_media_session_idx
  on session_media (session_id, display_order);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────

alter table session_media enable row level security;

-- Public read (same as session_photos)
create policy "session_media_public_read"
  on session_media for select
  using (true);

-- Authenticated users can insert their own uploads
create policy "session_media_insert_own"
  on session_media for insert
  with check (auth.email() = uploader_email);

-- Uploader or admin can update/delete
create policy "session_media_update_own_or_admin"
  on session_media for update
  using (
    auth.email() = uploader_email
    or exists (
      select 1 from users
      where email = auth.email()
      and role in ('admin', 'coach')
    )
  );

create policy "session_media_delete_own_or_admin"
  on session_media for delete
  using (
    auth.email() = uploader_email
    or exists (
      select 1 from users
      where email = auth.email()
      and role in ('admin', 'coach')
    )
  );

-- Service-role bypass (used by admin API routes)
create policy "session_media_service_all"
  on session_media for all
  using (auth.role() = 'service_role');

-- ── 3. Storage bucket for videos ──────────────────────────────────────────────
-- Run separately in the Supabase dashboard if the bucket doesn't exist:
--
--   insert into storage.buckets (id, name, public)
--   values ('session-videos', 'session-videos', true)
--   on conflict do nothing;
--
-- The bucket should allow mp4, mov, webm up to 100 MB.

-- ── 4. Convenience view ───────────────────────────────────────────────────────
-- Returns the best available cover asset for each session.
-- Falls back to the legacy photo_url column if no session_media row is marked
-- as cover, so nothing breaks while media is being migrated.

create or replace view session_cover_media as
  select
    s.id                                                              as session_id,
    coalesce(m.media_type, 'image')                                  as media_type,
    coalesce(m.url,        s.photo_url)                              as url,
    coalesce(m.thumbnail_url, s.photo_url)                           as thumbnail_url,
    m.duration_secs,
    m.id                                                             as media_id
  from sessions s
  left join session_media m
    on m.session_id = s.id
    and m.is_cover  = true;

comment on view session_cover_media is
  'One row per session: the cover video/image, falling back to sessions.photo_url';
