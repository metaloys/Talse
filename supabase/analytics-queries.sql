-- Analytics queries for the Pi Next submission evidence pack.
--
-- Table: public.events (migration 007) — append-only, service-role only.
-- Run with:
--   psql "$SUPABASE_DB_URL" -f supabase/analytics-queries.sql
--
-- Every query is read-only.

-- ---------------------------------------------------------------------------
-- 1) Funnel: unique Pioneers reaching each step (last 30 days)
-- ---------------------------------------------------------------------------
with windowed as (
  select pi_uid, name
  from events
  where created_at >= now() - interval '30 days'
)
select
  step,
  users
from (
  select 1 as ord, 'app opened' as step, count(distinct pi_uid) as users from windowed where name = 'app_open'
  union all
  select 2, 'viewed a listing', count(distinct pi_uid) from windowed where name = 'service_view'
  union all
  select 3, 'sent a request', count(distinct pi_uid) from windowed where name = 'request_sent'
  union all
  select 4, 'request accepted', count(distinct pi_uid) from windowed where name = 'request_accepted'
  union all
  select 5, 'funded escrow', count(distinct pi_uid) from windowed where name = 'payment_escrowed'
  union all
  select 6, 'payment released', count(distinct pi_uid) from windowed where name = 'payment_released'
  union all
  select 7, 'left a review', count(distinct pi_uid) from windowed where name = 'review_submitted'
) steps
order by ord;

-- ---------------------------------------------------------------------------
-- 2) Repeat hiring: share of buyers who completed 2+ paid jobs
-- ---------------------------------------------------------------------------
with buyers as (
  select pi_uid, count(*) as jobs
  from events
  where name = 'payment_released'
    and created_at >= now() - interval '90 days'
  group by pi_uid
)
select
  count(*) as buyers,
  count(*) filter (where jobs >= 2) as repeat_buyers,
  round(100.0 * count(*) filter (where jobs >= 2) / nullif(count(*), 0), 1) as repeat_rate_pct
from buyers;

-- ---------------------------------------------------------------------------
-- 3) Supply side: providers with at least one completed job
-- ---------------------------------------------------------------------------
select count(distinct pi_uid) as providers_with_completed_job
from events
where name = 'payment_released'
  and created_at >= now() - interval '90 days';

-- ---------------------------------------------------------------------------
-- 4) Daily activity (last 30 days) — for the demo video chart
-- ---------------------------------------------------------------------------
select
  date_trunc('day', created_at)::date as day,
  count(*) filter (where name = 'app_open') as opens,
  count(*) filter (where name = 'service_view') as listing_views,
  count(*) filter (where name = 'request_sent') as requests,
  count(*) filter (where name = 'payment_escrowed') as escrows,
  count(*) filter (where name = 'payment_released') as releases
from events
where created_at >= now() - interval '30 days'
group by 1
order by 1 desc;

-- ---------------------------------------------------------------------------
-- 5) Raw event mix (last 7 days) — sanity check that tracking is live
-- ---------------------------------------------------------------------------
select name, count(*) as events, count(distinct pi_uid) as users
from events
where created_at >= now() - interval '7 days'
group by 1
order by events desc;
