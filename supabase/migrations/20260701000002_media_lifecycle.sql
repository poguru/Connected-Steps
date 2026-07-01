-- ============================================================
-- Connected Steps — Media Lifecycle Management
-- File: 20260701000002_media_lifecycle.sql
-- Date: 2026-07-01
-- ============================================================
-- Adds automatic video retention tracking to the session_media
-- table.  Photos are kept indefinitely; videos are scheduled for
-- deletion after a configurable retention period (default 30 days).
--
-- A thumbnail is always preserved so historical sessions continue
-- to show a still image even after the video file is removed.
--
-- A separate media_settings table holds per-application config
-- so admins can adjust retention without a code deploy.
-- ============================================================

-- ── 1. Lifecycle columns on session_media ─────────────────────────────────────

-- When a video was uploaded and when it is scheduled for deletion.
-- NULL expires_at on photos → kept indefinitely.
alter table session_media
  add column if not exists uploaded_at   timestamptz not null default now(),
  add column if not exists expires_at    timestamptz,          -- null = never expire
  add column if not exists deleted_at    timestamptz,          -- soft-delete timestamp
  add column if not exists deleted_from_storage boolean not null default false;

-- Index for the cleanup cron query: find all expired, not-yet-deleted videos.
create index if not exists session_media_cleanup_idx
  on session_media (media_type, expires_at, deleted_at)
  where media_type = 'video' and deleted_at is null;

-- ── 2. Auto-set expires_at on video insert ────────────────────────────────────
-- Reads the retention period from media_settings (created below).
-- Falls back to 30 days if the row doesn't exist yet.
create or replace function set_video_expiry()
  returns trigger language plpgsql as $$
declare
  retention_days integer;
begin
  if new.media_type = 'video' and new.expires_at is null then
    select coalesce(
      (select (value::integer) from media_settings where key = 'video_retention_days'),
      30
    ) into retention_days;
    new.expires_at := now() + (retention_days || ' days')::interval;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_video_expiry on session_media;
create trigger trg_set_video_expiry
  before insert on session_media
  for each row execute function set_video_expiry();

-- ── 3. Media settings table ───────────────────────────────────────────────────

create table if not exists media_settings (
  key         text primary key,
  value       text not null,
  description text,
  updated_at  timestamptz not null default now()
);

-- Seed defaults
insert into media_settings (key, value, description) values
  ('video_retention_days',  '30',   'Days to keep video files before auto-deletion (0 = keep forever)'),
  ('cleanup_enabled',       'true', 'Enable automatic video cleanup job (true/false)'),
  ('last_cleanup_at',       '',     'ISO timestamp of the most recent successful cleanup run'),
  ('last_cleanup_deleted',  '0',    'Number of videos deleted in the last cleanup run')
on conflict (key) do nothing;

alter table media_settings enable row level security;

-- Admins can read and write; public cannot access
create policy "media_settings_admin_all"
  on media_settings for all
  using (auth.role() = 'service_role');

-- ── 4. Helper view — videos due for cleanup ───────────────────────────────────

create or replace view media_cleanup_queue as
  select
    m.id,
    m.session_id,
    m.url,
    m.thumbnail_url,
    m.expires_at,
    m.uploaded_at,
    m.is_cover
  from session_media m
  where m.media_type   = 'video'
    and m.deleted_at   is null
    and m.expires_at   is not null
    and m.expires_at   < now();

comment on view media_cleanup_queue is
  'Videos whose retention period has expired and are pending storage deletion.';

-- ── 5. Helper view — storage stats ───────────────────────────────────────────

create or replace view media_storage_stats as
  select
    count(*)                                               as total_items,
    count(*) filter (where media_type = 'image')           as total_images,
    count(*) filter (where media_type = 'video')           as total_videos,
    count(*) filter (where media_type = 'video'
                      and deleted_at is null)              as active_videos,
    count(*) filter (where media_type = 'video'
                      and deleted_at is not null)          as deleted_videos,
    sum(file_size) filter (where deleted_at is null)       as total_bytes,
    sum(file_size) filter (where media_type = 'video'
                            and deleted_at is null)        as video_bytes,
    min(expires_at) filter (where media_type = 'video'
                              and deleted_at is null)      as next_expiry_at
  from session_media;

comment on view media_storage_stats is
  'Aggregate storage statistics for the admin media settings panel.';
