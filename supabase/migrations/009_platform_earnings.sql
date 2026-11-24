-- Migration 009: platform earnings ledger.
--
-- The business question this answers: how much did the platform actually earn,
-- from which source, and what did it cost to earn it?
--
--   money in
--     - hire_requests.platform_fee   (10% of completed jobs, set at release)
--     - boost_purchases.amount       (featured listing boosts)
--   money out
--     - hire_requests.blockchain_fee (network fees the platform absorbs)
--     - boost_purchases.blockchain_fee
--
-- Everything below is derived from rows the app already writes; no new source
-- of truth is introduced.

-- Boost purchases now record the network cost attached to them.
alter table boost_purchases
  add column if not exists blockchain_fee numeric(12,2) not null default 0;

-- One Pi payment may only be redeemed once, even under concurrent requests.
create unique index if not exists boost_purchases_payment_id_key
  on boost_purchases (payment_id);

-- ---------------------------------------------------------------------------
-- One-row summary: lifetime totals, per source.
-- ---------------------------------------------------------------------------
create or replace view v_platform_earnings as
with jobs as (
  select
    count(*) filter (where status = 'released')                                as released_jobs,
    count(*) filter (where status = 'refunded')                                as refunded_jobs,
    coalesce(sum(amount) filter (where status = 'released'), 0)                as gross_volume,
    coalesce(sum(worker_payout) filter (where status = 'released'), 0)         as provider_payouts,
    coalesce(sum(platform_fee) filter (where status = 'released'), 0)          as transaction_fees,
    coalesce(sum(blockchain_fee) filter (where status = 'released'), 0)        as job_network_costs
  from hire_requests
),
boosts as (
  select
    count(*)                                                                   as boosts_sold,
    coalesce(sum(amount), 0)                                                   as boost_revenue,
    coalesce(sum(blockchain_fee), 0)                                           as boost_network_costs
  from boost_purchases
)
select
  j.transaction_fees,
  b.boost_revenue,
  j.gross_volume,
  j.provider_payouts,
  j.released_jobs,
  j.refunded_jobs,
  b.boosts_sold,
  j.job_network_costs,
  b.boost_network_costs,
  (j.job_network_costs + b.boost_network_costs)                                as network_costs,
  (j.transaction_fees + b.boost_revenue)                                       as gross_earnings,
  (j.transaction_fees + b.boost_revenue)
    - (j.job_network_costs + b.boost_network_costs)                            as net_earnings
from jobs j
cross join boosts b;

-- ---------------------------------------------------------------------------
-- Daily series, so the admin view can show "last 30 days" without ad-hoc SQL.
-- ---------------------------------------------------------------------------
create or replace view v_platform_earnings_daily as
select
  day,
  sum(transaction_fees)   as transaction_fees,
  sum(boost_revenue)      as boost_revenue,
  sum(network_costs)      as network_costs,
  sum(transaction_fees) + sum(boost_revenue) - sum(network_costs) as net_earnings
from (
  select
    date_trunc('day', coalesce(created_at, now()))::date as day,
    coalesce(platform_fee, 0) as transaction_fees,
    0::numeric               as boost_revenue,
    coalesce(blockchain_fee, 0) as network_costs
  from hire_requests
  where status = 'released'
  union all
  select
    date_trunc('day', created_at)::date,
    0::numeric,
    coalesce(amount, 0),
    coalesce(blockchain_fee, 0)
  from boost_purchases
) rows
group by day;

-- Views bypass RLS, so lock them down explicitly: only the service role
-- (which every /api/admin route uses) may read the platform's books.
revoke all on v_platform_earnings from anon, authenticated;
revoke all on v_platform_earnings_daily from anon, authenticated;
grant select on v_platform_earnings to service_role;
grant select on v_platform_earnings_daily to service_role;

comment on view v_platform_earnings is 'Platform P&L: earnings by source minus network costs.';
comment on view v_platform_earnings_daily is 'Daily platform P&L for charts.';
