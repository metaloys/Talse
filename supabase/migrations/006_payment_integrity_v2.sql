-- Migration 006: payment binding integrity.
--
-- 1) One Pi payment may only ever be bound to ONE hire request
--    (hire_requests.escrow_request_id). Without a unique constraint, a single
--    payment could back multiple hire requests and be released twice.
--
-- 2) NOTE: check_rate_limit(), acquire_payout_wallet_lease() and
--    release_payout_wallet_lease() already exist in the live deployment
--    (applied outside the repo, correct/atomic versions — the lease takes a
--    uuid owner and is update-only, requiring a seeded 'app_wallet' row).
--    This migration intentionally does NOT replace them. For fresh
--    environments the lease functions come from 003_money_integrity.sql and
--    the rate limiter is created by the guarded block below.

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
-- 2) Rate limiting — created ONLY if the deployment doesn't have it yet.
--    Matches the call signature in lib/rate-limit.ts:
--      supabaseAdmin.rpc("check_rate_limit", { p_key, p_limit, p_window_seconds })
--    Returns true when the request is ALLOWED (hit_count <= limit).
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'check_rate_limit') then
    create table rate_limits (
      rl_key text primary key,
      window_start timestamptz not null default now(),
      count integer not null default 0
    );

    create or replace function check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
    returns boolean
    language plpgsql
    security definer
    set search_path to public
    as $fn$
    declare
      v_count integer;
    begin
      insert into rate_limits (rl_key, window_start, count)
      values (p_key, now(), 1)
      on conflict (rl_key) do update
        set count = case
              when rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
              then 1
              else rate_limits.count + 1
            end,
            window_start = case
              when rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
              then now()
              else rate_limits.window_start
            end
      returning count into v_count;

      return v_count <= p_limit;
    end;
    $fn$;
  end if;
end;
$$;
