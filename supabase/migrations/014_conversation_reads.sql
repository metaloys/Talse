-- ============================================================================
-- Conversation read state (messaging Tier 3)
--
-- Drives the unread badge on the Messages tab and the per-conversation dots.
-- One row per (hire_request, participant) holding the last time that person
-- opened the thread. Unread = messages from the other side newer than
-- `last_read_at`.
--
-- Server-only: reads/writes go through the Next.js API routes using the
-- service-role key after verifying the Pi token. RLS is enabled with no
-- permissive policy, so the anon key cannot read other people's state.
-- ============================================================================

create table if not exists conversation_reads (
  hire_request_id uuid not null references hire_requests(id) on delete cascade,
  user_uid        text not null references profiles(pi_uid) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (hire_request_id, user_uid)
);

create index if not exists idx_conversation_reads_user
  on conversation_reads(user_uid);

alter table conversation_reads enable row level security;