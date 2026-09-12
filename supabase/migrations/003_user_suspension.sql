-- Migration: Add user suspension state to profiles and support admin enforcement.

alter table profiles
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text;

create index if not exists idx_profiles_suspended_at on profiles(suspended_at);
