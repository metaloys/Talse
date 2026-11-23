-- Migration 007: product analytics events.
--
-- Append-only event log used to measure the funnel the Pi Next submission
-- depends on: open -> view service -> request -> escrow -> release -> repeat.
-- Written only by the server (service role); clients never read it back.
--
-- RLS is enabled with NO policies, so anon/authenticated keys cannot read or
-- write events. All access goes through POST /api/events.

create table if not exists events (
  id bigserial primary key,
  pi_uid text not null,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  session_id text,
  created_at timestamptz not null default now(),
  constraint events_name_len check (char_length(name) between 2 and 64)
);

-- Funnel queries filter by name over a time window.
create index if not exists events_name_created_at_idx
  on events (name, created_at desc);

-- Retention / repeat-hire queries group by user over a time window.
create index if not exists events_pi_uid_created_at_idx
  on events (pi_uid, created_at desc);

alter table events enable row level security;

comment on table events is 'Append-only product analytics. Service-role writes only.';
