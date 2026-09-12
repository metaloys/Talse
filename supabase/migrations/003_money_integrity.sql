-- Migration 003: money-integrity hardening for payout locks, payout wallet lease,
-- profile payout summaries, and realtime participant auth guardrails.

create table if not exists payout_wallet_lease (
  wallet_id text primary key,
  lease_owner text not null,
  lease_acquired_at timestamptz not null default now(),
  lease_expires_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function acquire_payout_wallet_lease(p_wallet_id text, p_owner text, p_ttl_seconds integer default 45)
returns table (acquired boolean)
language plpgsql
as $$
begin
  if exists (
    select 1
    from payout_wallet_lease
    where wallet_id = p_wallet_id
      and lease_expires_at > now()
      and lease_owner <> p_owner
  ) then
    return query select false;
    return;
  end if;

  insert into payout_wallet_lease (wallet_id, lease_owner, lease_acquired_at, lease_expires_at, updated_at)
  values (p_wallet_id, p_owner, now(), now() + make_interval(secs => p_ttl_seconds), now())
  on conflict (wallet_id)
  do update set
    lease_owner = excluded.lease_owner,
    lease_acquired_at = excluded.lease_acquired_at,
    lease_expires_at = excluded.lease_expires_at,
    updated_at = now()
  where payout_wallet_lease.lease_expires_at <= now() or payout_wallet_lease.lease_owner = p_owner;

  return query select true;
end;
$$;

create or replace function release_payout_wallet_lease(p_wallet_id text, p_owner text)
returns void
language plpgsql
as $$
begin
  delete from payout_wallet_lease
  where wallet_id = p_wallet_id
    and lease_owner = p_owner;
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
