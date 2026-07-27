-- Event Version History
-- Stores point-in-time snapshots of event configuration.
-- Versions are created manually (checkpoints) or automatically on publish.
-- Restoring a version overwrites the live event row without touching registrations.

create table if not exists event_versions (
  id             uuid        primary key default gen_random_uuid(),
  event_id       uuid        not null references events(id) on delete cascade,
  version_number integer     not null,
  snapshot       jsonb       not null,        -- full event row at checkpoint time
  label          text,                        -- human-readable name, e.g. "Before price change"
  created_by     text,                        -- email / identifier of who created it
  created_at     timestamptz not null default now(),

  unique (event_id, version_number)
);

create index if not exists event_versions_event_id_idx on event_versions (event_id, version_number desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table event_versions enable row level security;

-- Service-role key (used by all admin API routes) bypasses RLS entirely.
-- Add a restrictive policy so direct DB clients cannot read raw snapshots.
create policy "no_direct_access" on event_versions
  as restrictive
  using (false);
