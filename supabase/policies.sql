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

create policy "profiles are publicly readable"
  on profiles for select
  using (true);

create policy "reviews are publicly readable"
  on reviews for select
  using (true);

-- Everything else (insert/update/delete on services, all access to
-- hire_requests/messages/boost_purchases) is intentionally NOT covered by a
-- policy here, which means it is denied for the anon key and only reachable
-- via the service-role key from your API routes. This is deliberate: hire
-- requests and messages contain data that must be scoped per-user by server
-- logic (buyer_uid / provider_uid), not by a client-supplied filter.
