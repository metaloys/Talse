-- Migration 006: payment binding integrity + atomic wallet lease + rate limiting.
--
-- 1) One Pi payment may only ever be bound to ONE hire request
--    (hire_requests.escrow_request_id). Without a unique constraint, a single
--    payment could back multiple hire requests and be released twice.
-- 2) acquire_payout_wallet_lease previously returned `true` unconditionally,
--    even when the upsert matched no row (lease held by someone else). Fixed
--    to only return true when this caller actually holds the lease.
-- 3) check_rate_limit was referenced by lib/rate-limit.ts but defined in no
--    migration — the rate limiter silently no-op'd on every RPC error.
--    Fixed-window counter table + function added here.

-- ---------------------------------------------------------------------------
-- 1) Unique escrow payment binding
-- ---------------------------------------------------------------------------

-- Clear duplicate bindings first: keep the earliest-created binding per
-- paymentId, null out the rest so the unique index can be created safely.
with ranked as (
  select id,
         row_number() over (
           partition by escrow_request_id
           order by created_at asc, id asc
         ) as rn
  from hire_requests
  where escrow_request_id is not null
)
update hire_requests
set escrow_request_id = null
where escrow_request_id is not null
  and id in (select id from ranked where rn > 1);

-- Partial unique index: multiple NULLs are fine (most requests are unbound).
create unique index if not exists hire_requests_escrow_request_id_uniq
  on hire_requests (escrow_request_id)
  where escrow_request_id is not null;

-- ---------------------------------------------------------------------------
-- 2) Atomic payout wallet lease
-- ---------------------------------------------------------------------------

create table if not exists payout_wallet_lease (
  wallet_id text primary key,
  lease_owner text not null,
  lease_acquired_at timestamptz not null default now(),
  lease_expires_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Replacement for the version in 003_money_integrity.sql. The only change is
-- correctness: the function now returns whether the caller actually acquired
-- the lease. `returning lease_owner into v_owner` yields NULL when the
-- ON CONFLICT DO UPDATE ... WHERE clause matched no row (live lease held by
-- another owner), which is exactly the "not acquired" case.
create or replace function acquire_payout_wallet_lease(p_wallet_id text, p_owner text, p_ttl_seconds integer default 45)
returns table (acquired boolean)
language plpgsql
as $$
declare
  v_owner text;
begin
  insert into payout_wallet_lease (wallet_id, lease_owner, lease_acquired_at, lease_expires_at, updated_at)
  values (p_wallet_id, p_owner, now(), now() + make_interval(secs => p_ttl_seconds), now())
  on conflict (wallet_id)
  do update set
    lease_owner = excluded.lease_owner,
    lease_acquired_at = excluded.lease_acquired_at,
    lease_expires_at = excluded.lease_expires_at,
    updated_at = now()
  where payout_wallet_lease.lease_expires_at <= now() or payout_wallet_lease.lease_owner = p_owner
  returning lease_owner into v_owner;

  if v_owner is null then
    return query select false;
    return;
  end if;

  return query select true;
end;
$$;

-- release_payout_wallet_lease is unchanged from 003; re-asserted for parity.
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

-- ---------------------------------------------------------------------------
-- 3) Rate limiting (fixed-window counter)
-- ---------------------------------------------------------------------------

create table if not exists rate_limit_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  hit_count integer not null default 0
);

-- Matches the call signature in lib/rate-limit.ts:
--   supabaseAdmin.rpc("check_rate_limit", { p_key, p_limit, p_window_seconds })
-- Returns true when the request is ALLOWED (hit_count <= limit), false when
-- the caller has exhausted the window.
create or replace function check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
as $$
declare
  v_count integer;
begin
  insert into rate_limit_buckets (bucket_key, window_started_at, hit_count)
  values (p_key, now(), 1)
  on conflict (bucket_key) do update set
    window_started_at = case
      when rate_limit_buckets.window_started_at <= now() - make_interval(secs => p_window_seconds)
      then now()
      else rate_limit_buckets.window_started_at
    end,
    hit_count = case
      when rate_limit_buckets.window_started_at <= now() - make_interval(secs => p_window_seconds)
      then 1
      else rate_limit_buckets.hit_count + 1
    end
  returning hit_count into v_count;

  return v_count <= p_limit;
end;
$$;
