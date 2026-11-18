-- Migration 003: money-integrity hardening for payout locks, payout wallet lease,
-- profile payout summaries, and realtime participant auth guardrails.
--
-- NOTE (audit follow-up): the payout wallet lease functions below were corrected
-- to match the versions deployed in the live database (uuid owner, atomic
-- update-based acquisition that returns false when another owner holds a live
-- lease, release that nulls the lease). The earlier text-owner version in this
-- file returned `true` unconditionally and was never applied to the live DB.

create table if not exists payout_wallet_lease (
  wallet_id text primary key,
  lease_owner uuid,
  lease_acquired_at timestamptz,
  lease_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Seed the app wallet row: acquire_payout_wallet_lease is update-only and
-- requires a pre-existing row for the wallet.
insert into payout_wallet_lease (wallet_id) values ('app_wallet')
on conflict (wallet_id) do nothing;

create or replace function acquire_payout_wallet_lease(p_wallet_id text, p_owner uuid, p_ttl_seconds integer default 45)
returns table (acquired boolean, lease_owner uuid, lease_expires_at timestamp with time zone)
language plpgsql
security definer
set search_path to public
as $$
begin
  return query
  update payout_wallet_lease
  set lease_owner = p_owner,
      lease_acquired_at = now(),
      lease_expires_at = now() + make_interval(secs => p_ttl_seconds)
  where wallet_id = p_wallet_id
    and (payout_wallet_lease.lease_owner is null
         or payout_wallet_lease.lease_expires_at < now())
  returning true, payout_wallet_lease.lease_owner, payout_wallet_lease.lease_expires_at;

  if not found then
    return query select false, null::uuid, null::timestamptz;
  end if;
end;
$$;

create or replace function release_payout_wallet_lease(p_wallet_id text, p_owner uuid)
returns boolean
language plpgsql
security definer
set search_path to public
as $$
declare
  v_count int;
begin
  update payout_wallet_lease
  set lease_owner = null,
      lease_acquired_at = null,
      lease_expires_at = null
  where wallet_id = p_wallet_id
    and lease_owner = p_owner;

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

alter table profiles add column if not exists jobs_completed integer not null default 0;
alter table profiles add column if not exists total_earned numeric(12,2) not null default 0;
alter table profiles add column if not exists refunds_against_provider numeric(12,2) not null default 0;

create or replace function realtime_hire_request_allowed(channel_name text)
returns boolean
language sql
security definer
as $$
  select exists (
    select 1
    from hire_requests hr
    where channel_name = 'hire_request:' || hr.id::text
      and (
        hr.buyer_uid = auth.uid()::text or
        hr.provider_uid = auth.uid()::text
      )
  );
$$;

-- Note: permission enforcement is expected to be wired in Supabase Realtime
-- policies or server-side channel authorizers in the deployment environment.
