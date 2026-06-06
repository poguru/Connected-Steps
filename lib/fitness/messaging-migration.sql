-- ── Messaging system migration ──────────────────────────────────────────────────
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor > New Query)

-- 1. Coaches directory
create table if not exists coaches (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  specialization  text,
  email           text unique not null,
  avatar_url      text,
  bio             text,
  is_active       boolean default true,
  created_at      timestamptz default now()
);

-- Seed with existing Connected Steps coaches
insert into coaches (name, specialization, email, bio) values
  ('Ashokan K',             'Head Athletics & Conditioning Coach', 'ashokan@connectedsteps.in',  'Head coach with expertise in athletics and conditioning.'),
  ('Durga Rao Vana',        'Marathon Coach',                      'durga@connectedsteps.in',    'Specialist in long-distance running and marathon preparation.'),
  ('Achyuta Kumari Kolli',  'Sprint & Strength Coach',             'achyuta@connectedsteps.in',  'Focuses on speed development and strength training for runners.')
on conflict (email) do nothing;

-- 2. Conversations: one per (user, coach) pair
create table if not exists conversations (
  id                    uuid primary key default gen_random_uuid(),
  user_email            text not null,
  coach_id              uuid not null references coaches(id) on delete cascade,
  created_at            timestamptz default now(),
  last_message_at       timestamptz default now(),
  last_message_preview  text,
  user_unread           int not null default 0,
  coach_unread          int not null default 0,
  unique (user_email, coach_id)
);

create index if not exists conversations_user_email_idx  on conversations (user_email);
create index if not exists conversations_coach_id_idx    on conversations (coach_id);
create index if not exists conversations_last_msg_idx    on conversations (last_message_at desc);

-- 3. Messages within a conversation
create table if not exists messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations(id) on delete cascade,
  sender_email     text not null,
  sender_type      text not null check (sender_type in ('user', 'coach')),
  body             text not null,
  created_at       timestamptz default now(),
  read_at          timestamptz
);

create index if not exists messages_conversation_idx on messages (conversation_id, created_at);

-- 4. Expo push tokens for notifications
create table if not exists push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_email  text not null,
  token       text not null unique,
  platform    text,  -- 'ios' | 'android'
  created_at  timestamptz default now()
);

create index if not exists push_tokens_user_idx on push_tokens (user_email);

-- 5. Enable Supabase Realtime for live message delivery
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;
