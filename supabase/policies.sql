-- ============================================================================
-- Row Level Security
-- These tables are only ever written to via the Next.js API routes using the
-- Supabase SERVICE ROLE key (server-side, after verifying the Pi access token
-- against the Pi Platform API /me endpoint). The anon/public key is only used
-- for read-only SELECTs where noted. Never expose the service role key to
-- the client.
-- ============================================================================

alter table profiles      enable row level security;
alter table services      enable row level security;
alter table hire_requests enable row level security;
alter table messages      enable row level security;
alter table reviews       enable row level security;
alter table boost_purchases enable row level security;

-- Public read access for browsing the marketplace (home/search/category screens)
create policy "services are publicly readable"
  on services for select
  using (active = true);

-- profiles: NO direct public policy. The blanket `using (true)` policy exposed
-- every column (wallet_address, suspended_at, suspension_reason) to the anon
-- key. Public identity/reputation data is exposed through the
-- public_profiles view instead (SELECT-only, safe columns); all server reads
-- go through the service role.
revoke all privileges on profiles from anon;
revoke all privileges on profiles from authenticated;

create or replace view public_profiles as
  select pi_uid, username, display_name, bio, avatar_url,
         rating_avg, rating_count, jobs_completed, refunds_against_provider,
         total_earned, location, created_at
  from profiles;

grant select on public_profiles to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public_profiles from anon, authenticated;

create policy "reviews are publicly readable"
  on reviews for select
  using (true);

-- Everything else (insert/update/delete on services, all access to
-- hire_requests/messages/boost_purchases) is intentionally NOT covered by a
-- policy here, which means it is denied for the anon key and only reachable
-- via the service-role key from your API routes. This is deliberate: hire
-- requests and messages contain data that must be scoped per-user by server
-- logic (buyer_uid / provider_uid), not by a client-supplied filter.
