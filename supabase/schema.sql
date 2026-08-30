-- ============================================================================
-- Pi Services Marketplace — Shared Backend Schema
-- Replaces the missing sdk.appState/globalState/sharedState store referenced
-- in contexts/services-context.tsx (sharedStoreFromSdk). Run this in the
-- Supabase SQL editor, or via `supabase db push` if you keep it in a migration.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- users (mirrors Pi identity; uid comes from Pi.authenticate(), NOT trusted
-- client-side — always re-verify server-side against the Pi Platform API
-- /me endpoint before writing anything tied to a uid)
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  pi_uid          text primary key,
  username        text not null,
  display_name    text,
  bio             text,
  avatar_url      text,
  wallet_address  text,
  rating_avg      numeric(3,2) default 0,
  rating_count    integer default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- services (the shared listings catalog — the core gap in the current app)
-- ---------------------------------------------------------------------------
create table if not exists services (
  id            uuid primary key default gen_random_uuid(),
  owner_uid     text not null references profiles(pi_uid) on delete cascade,
  title         text not null,
  category      text not null,
  description   text not null,
  price         numeric(12,2) not null check (price >= 0),
  delivery_id   text not null,
  images        text[] not null default '{}',
  active        boolean not null default true,
  boosted_until timestamptz,               -- set when Boost Listing purchase completes
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_services_owner on services(owner_uid);
create index if not exists idx_services_category on services(category) where active;
create index if not exists idx_services_active on services(active);

-- ---------------------------------------------------------------------------
-- hire_requests (status lifecycle mirrors HireRequest type in lib/services/data.ts,
-- extended with escrow linkage fields for the smart-contract flow)
-- ---------------------------------------------------------------------------
create type request_status as enum (
  'pending',        -- buyer submitted, awaiting provider acceptance
  'accepted',       -- provider accepted; escrow lock expected next
  'locked',         -- Pi is locked in the escrow contract
  'delivered',      -- provider marked delivered, awaiting buyer confirmation
  'released',       -- buyer confirmed; contract released funds to provider
  'disputed',       -- either party opened a dispute
  'refunded',       -- contract refunded buyer
  'cancelled'       -- cancelled pre-lock, no funds ever moved
);

create table if not exists hire_requests (
  id                uuid primary key default gen_random_uuid(),
  service_id        uuid not null references services(id) on delete restrict,
  buyer_uid         text not null references profiles(pi_uid),
  provider_uid      text not null references profiles(pi_uid),
  message           text not null,
  deadline          date,
  attachments       text[] not null default '{}',
  status            request_status not null default 'pending',
  amount            numeric(12,2) not null,

  -- escrow linkage — filled in once the contract call succeeds
  contract_id       text,          -- deployed escrow contract address
  escrow_request_id text,          -- the request_id passed into lock()/release()
  lock_txid         text,
  release_txid      text,
  refund_txid       text,

  -- dispute detail (filed by buyer or provider when status -> 'disputed')
  dispute_reason    text,
  dispute_details   text,
  dispute_evidence  text[] not null default '{}',
  dispute_filed_by  text references profiles(pi_uid),
  dispute_stage     text,          -- null | 'investigating' | 'escalated'
  admin_note        text,
  resolved_by       text references profiles(pi_uid),
  resolved_favor    text,          -- 'provider' | 'buyer', set when an admin resolves a dispute

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_hire_buyer on hire_requests(buyer_uid);
create index if not exists idx_hire_provider on hire_requests(provider_uid);
create index if not exists idx_hire_status on hire_requests(status);

-- ---------------------------------------------------------------------------
-- messages (per hire_request conversation thread)
-- ---------------------------------------------------------------------------
create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  hire_request_id uuid not null references hire_requests(id) on delete cascade,
  sender_uid      text not null references profiles(pi_uid),
  text            text not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_messages_request on messages(hire_request_id, created_at);

-- ---------------------------------------------------------------------------
-- reviews (left after a hire_request reaches 'released')
-- ---------------------------------------------------------------------------
create table if not exists reviews (
  id              uuid primary key default gen_random_uuid(),
  hire_request_id uuid not null unique references hire_requests(id) on delete cascade,
  reviewer_uid    text not null references profiles(pi_uid),
  provider_uid    text not null references profiles(pi_uid),
  rating          integer not null check (rating between 1 and 5),
  text            text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_reviews_provider on reviews(provider_uid);

-- ---------------------------------------------------------------------------
-- boost_purchases (audit trail for sdk.makePurchase() boost product)
-- ---------------------------------------------------------------------------
create table if not exists boost_purchases (
  id            uuid primary key default gen_random_uuid(),
  service_id    uuid not null references services(id) on delete cascade,
  buyer_uid     text not null references profiles(pi_uid),
  payment_id    text not null,
  txid          text,
  amount        numeric(12,2) not null,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_services_updated on services;
create trigger trg_services_updated before update on services
  for each row execute function set_updated_at();

drop trigger if exists trg_hire_updated on hire_requests;
create trigger trg_hire_updated before update on hire_requests
  for each row execute function set_updated_at();

drop trigger if exists trg_profiles_updated on profiles;
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- rating rollup trigger (keeps profiles.rating_avg/count in sync with reviews)
-- ---------------------------------------------------------------------------
create or replace function refresh_provider_rating()
returns trigger as $$
begin
  update profiles p
  set rating_count = sub.cnt,
      rating_avg = sub.avg_rating
  from (
    select provider_uid, count(*) as cnt, avg(rating)::numeric(3,2) as avg_rating
    from reviews
    where provider_uid = coalesce(new.provider_uid, old.provider_uid)
    group by provider_uid
  ) sub
  where p.pi_uid = sub.provider_uid;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_reviews_rollup on reviews;
create trigger trg_reviews_rollup after insert or update or delete on reviews
  for each row execute function refresh_provider_rating();

-- ---------------------------------------------------------------------------
-- Added: profile.location column (brief#17)
-- Ensure the 'location' field is available for the UI's Profile type.
-- Run this in the Supabase SQL editor or include in your migration pipeline.
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists location text;
