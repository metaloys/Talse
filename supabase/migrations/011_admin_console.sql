-- Migration 011: admin console foundation.
--
-- The previous admin gate was a comma-separated ADMIN_PI_UIDS env var, and the
-- panel read only what each route happened to select. This migration gives the
-- console three things it was missing:
--
--   1. admin_users        — who can administer the platform, and as which role
--   2. platform_settings  — the numbers the console displays *and edits*
--                           (platform fee %, boost price/duration, limits)
--   3. admin read views   — one flat row per order / user / listing / offer /
--                           boost, with the joins and aggregates the console
--                           needs, so the API stays a thin projection.
--
-- ADMIN_PI_UIDS remains the bootstrap: the first env-configured admin to open
-- the console is recorded here as `owner`, so access survives without the env
-- var and every admin action can be attributed to a role.
--
-- Views are revoked from anon/authenticated and granted to service_role, the
-- same convention as migration 009, because they bypass RLS.

-- ---------------------------------------------------------------------------
-- 1. Admins and roles
-- ---------------------------------------------------------------------------
create table if not exists admin_users (
  pi_uid        text primary key,
  role          text not null default 'support'
                check (role in ('owner', 'ops', 'finance', 'support', 'readonly')),
  granted_by    text,
  granted_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  notes         text
);

comment on table admin_users is
  'Admin console access and role. ADMIN_PI_UIDS bootstraps the first owner.';

-- ---------------------------------------------------------------------------
-- 2. Editable platform settings
-- ---------------------------------------------------------------------------
create table if not exists platform_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create table if not exists platform_settings_history (
  id             bigserial primary key,
  key            text not null,
  previous_value jsonb,
  new_value      jsonb not null,
  changed_by     text not null,
  changed_at     timestamptz not null default now()
);

create index if not exists platform_settings_history_key_idx
  on platform_settings_history (key, changed_at desc);

comment on table platform_settings is
  'Console-editable platform configuration (fees, boost pricing, limits).';
comment on table platform_settings_history is
  'Append-only trail of configuration changes, for the audit view.';

-- Defaults. The app reads these through lib/platform-settings.ts, falling back
-- to the existing env vars / constants when a key is absent.
insert into platform_settings (key, value) values
  ('platform_fee_percent',      '0.10'::jsonb),
  ('network_fee_pi',            '0.01'::jsonb),
  ('boost_price_pi',            '5'::jsonb),
  ('boost_duration_days',       '7'::jsonb),
  ('max_listing_images',        '4'::jsonb),
  ('max_image_upload_mb',       '12'::jsonb),
  ('dispute_sla_hours',         '48'::jsonb),
  ('maintenance_mode',          'false'::jsonb),
  ('feature_offers_enabled',    'true'::jsonb),
  ('feature_boosts_enabled',    'true'::jsonb),
  ('feature_analytics_enabled', 'true'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Admin read views
-- ---------------------------------------------------------------------------

-- Orders: one row per hire request, with participants, the listing it was for,
-- and conversation volume. Money columns are included so the Orders and
-- Escrow screens can render from a single shape.
create or replace view v_orders_admin as
select
  hr.id,
  hr.service_id,
  hr.buyer_uid,
  hr.provider_uid,
  hr.status,
  hr.amount,
  hr.platform_fee,
  hr.worker_payout,
  hr.blockchain_fee,
  hr.payout_status,
  hr.payout_locked_at,
  hr.contract_id,
  hr.escrow_request_id,
  hr.lock_txid,
  hr.release_txid,
  hr.refund_txid,
  hr.dispute_reason,
  hr.dispute_details,
  hr.dispute_evidence,
  hr.dispute_filed_by,
  hr.dispute_stage,
  hr.admin_note,
  hr.resolved_by,
  hr.resolved_favor,
  hr.deadline,
  hr.reference_notes,
  hr.created_at,
  hr.updated_at,
  s.title          as service_title,
  s.category       as service_category,
  s.cover_image    as service_cover_image,
  coalesce(nullif(b.display_name, ''), b.username, hr.buyer_uid)   as buyer_name,
  b.username       as buyer_username,
  b.avatar_url     as buyer_avatar,
  coalesce(nullif(p.display_name, ''), p.username, hr.provider_uid) as provider_name,
  p.username       as provider_username,
  p.avatar_url     as provider_avatar,
  coalesce(m.message_count, 0) as message_count,
  m.last_message_at
from hire_requests hr
left join services s on s.id = hr.service_id
left join profiles b on b.pi_uid = hr.buyer_uid
left join profiles p on p.pi_uid = hr.provider_uid
left join lateral (
  select count(*) as message_count, max(created_at) as last_message_at
  from messages msg
  where msg.hire_request_id = hr.id
) m on true;

-- Users: profile plus the activity counts an operator needs to judge an
-- account without opening five tabs.
create or replace view v_users_admin as
select
  pr.pi_uid,
  pr.username,
  pr.display_name,
  pr.bio,
  pr.avatar_url,
  pr.location,
  pr.wallet_address,
  pr.rating_avg,
  pr.rating_count,
  pr.jobs_completed,
  pr.refunds_against_provider,
  pr.total_earned,
  pr.created_at,
  pr.updated_at,
  pr.suspended_at,
  pr.suspension_reason,
  coalesce(lst.listings_count, 0)      as listings_count,
  coalesce(lst.active_listings, 0)     as active_listings,
  coalesce(ob.orders_as_buyer, 0)      as orders_as_buyer,
  coalesce(op.orders_as_provider, 0)   as orders_as_provider,
  coalesce(op.completed_jobs, 0)       as completed_jobs,
  coalesce(rf.reports_filed, 0)        as reports_filed,
  coalesce(ra.reports_against, 0)      as reports_against,
  coalesce(rv.reviews_received, 0)     as reviews_received,
  coalesce(bs.boost_spend, 0)          as boost_spend
from profiles pr
left join lateral (
  select count(*) as listings_count,
         count(*) filter (where active) as active_listings
  from services s where s.owner_uid = pr.pi_uid
) lst on true
left join lateral (
  select count(*) as orders_as_buyer
  from hire_requests hr where hr.buyer_uid = pr.pi_uid
) ob on true
left join lateral (
  select count(*) as orders_as_provider,
         count(*) filter (where status = 'released') as completed_jobs
  from hire_requests hr where hr.provider_uid = pr.pi_uid
) op on true
left join lateral (
  select count(*) as reports_filed from reports r where r.reporter_uid = pr.pi_uid
) rf on true
left join lateral (
  select count(*) as reports_against
  from reports r
  where (r.target_type = 'user' and r.target_id = pr.pi_uid)
) ra on true
left join lateral (
  select count(*) as reviews_received from reviews rv where rv.provider_uid = pr.pi_uid
) rv on true
left join lateral (
  select coalesce(sum(bp.amount), 0) as boost_spend
  from boost_purchases bp where bp.buyer_uid = pr.pi_uid
) bs on true;

-- Listings for the console. Deliberately selects cover_image, never images:
-- the full base64 gallery must not travel with list responses (see migration
-- 010 and the catalogue payload fix).
create or replace view v_services_admin as
select
  s.id,
  s.owner_uid,
  s.title,
  s.category,
  c.label   as category_label,
  c.short   as category_short,
  c.hue     as category_hue,
  s.price,
  s.delivery_id,
  s.active,
  s.boosted_until,
  s.cover_image,
  s.created_at,
  s.updated_at,
  coalesce(nullif(p.display_name, ''), p.username, s.owner_uid) as provider_name,
  p.username     as provider_username,
  p.avatar_url   as provider_avatar,
  p.rating_avg,
  p.jobs_completed,
  coalesce(v.views, 0)    as view_count,
  coalesce(o.orders, 0)   as order_count,
  coalesce(b.boosts, 0)   as boost_count
from services s
left join categories c on c.id = s.category
left join profiles p on p.pi_uid = s.owner_uid
left join lateral (
  select count(*) as views
  from events e
  where e.name = 'service_view' and e.props->>'service_id' = s.id::text
) v on true
left join lateral (
  select count(*) as orders from hire_requests hr where hr.service_id = s.id
) o on true
left join lateral (
  select count(*) as boosts from boost_purchases bp where bp.service_id = s.id
) b on true;

-- Offers / counter-offers, with enough context to read the negotiation.
create or replace view v_offers_admin as
select
  ho.id,
  ho.hire_request_id,
  ho.proposer_uid,
  coalesce(nullif(pr.display_name, ''), pr.username, ho.proposer_uid) as proposer_name,
  pr.username     as proposer_username,
  ho.amount,
  ho.message,
  ho.status,
  ho.created_at,
  ho.responded_at,
  hr.amount       as request_amount,
  hr.status       as request_status,
  s.title         as service_title,
  hr.buyer_uid,
  hr.provider_uid
from hire_offers ho
left join hire_requests hr on hr.id = ho.hire_request_id
left join services s on s.id = hr.service_id
left join profiles pr on pr.pi_uid = ho.proposer_uid;

-- Boost ledger.
create or replace view v_boosts_admin as
select
  bp.id,
  bp.service_id,
  s.title         as service_title,
  s.cover_image   as service_cover_image,
  bp.buyer_uid,
  coalesce(nullif(pr.display_name, ''), pr.username, bp.buyer_uid) as buyer_name,
  pr.username     as buyer_username,
  bp.payment_id,
  bp.txid,
  bp.amount,
  bp.blockchain_fee,
  bp.created_at,
  s.boosted_until
from boost_purchases bp
left join services s on s.id = bp.service_id
left join profiles pr on pr.pi_uid = bp.buyer_uid;

-- Lock the new views down the same way as 009.
revoke all on v_orders_admin   from anon, authenticated;
revoke all on v_users_admin    from anon, authenticated;
revoke all on v_services_admin from anon, authenticated;
revoke all on v_offers_admin   from anon, authenticated;
revoke all on v_boosts_admin   from anon, authenticated;
grant select on v_orders_admin   to service_role;
grant select on v_users_admin    to service_role;
grant select on v_services_admin to service_role;
grant select on v_offers_admin   to service_role;
grant select on v_boosts_admin   to service_role;

revoke all on admin_users from anon, authenticated;
grant select, insert, update, delete on admin_users to service_role;
revoke all on platform_settings from anon, authenticated;
grant select, insert, update on platform_settings to service_role;
revoke all on platform_settings_history from anon, authenticated;
grant select, insert on platform_settings_history to service_role;
grant usage, select on sequence platform_settings_history_id_seq to service_role;

comment on view v_orders_admin is 'One flat row per hire request for the admin console.';
comment on view v_users_admin is 'Profile plus activity counts for the admin console.';
comment on view v_services_admin is 'Listings for the console; cover_image only, never images.';
comment on view v_offers_admin is 'Counter-offers with negotiation context.';
comment on view v_boosts_admin is 'Boost purchase ledger.';
