-- ============================================================================
-- Migration 015: Realtime broadcast — source of truth + notifications
--
-- Captures, in source control, the broadcast layer that keeps the app live:
-- signal-only broadcasts published from the database (so *any* writer — API
-- route, admin console, future feature — triggers them automatically), plus
-- the Realtime Authorization policies that let the right people receive them.
--
-- Design: payloads carry only ids/timestamps, never private content. Clients
-- treat them as "something changed" signals and re-fetch through the
-- authenticated API, which re-checks permissions.
--
-- Topics / events (must match the client subscriptions):
--   services-feed                        event `service_changed`   (public)
--   hire_request:<id>                    event `message_added`     (private)
--   hire_request:<id>                    event `changed`           (private)
--   user:<provider_uid>:incoming-requests event `new_request`      (private)
--   user:<uid>:notifications             event `notification`      (private)  [new]
--
-- The client authorizes its socket with realtime.setAuth(minted Pi JWT) — see
-- contexts/realtime-client-context.tsx. Without that call private channels fail
-- to subscribe even when these policies exist.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Authorization helper for the private `hire_request:<id>` channel
-- ---------------------------------------------------------------------------
create or replace function public.is_hire_request_participant(p_hire_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.hire_requests hr
    where hr.id = p_hire_request_id
      and (
        hr.buyer_uid = (auth.jwt() ->> 'pi_uid')
        or hr.provider_uid = (auth.jwt() ->> 'pi_uid')
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Broadcast helpers (signal-only payloads)
-- ---------------------------------------------------------------------------
create or replace function public.broadcast_message_added()
returns trigger
language plpgsql
security definer
as $$
begin
  perform realtime.send(
    jsonb_build_object('id', new.id, 'hire_request_id', new.hire_request_id, 'created_at', new.created_at),
    'message_added',
    'hire_request:' || new.hire_request_id,
    true
  );
  return new;
end;
$$;

create or replace function public.broadcast_hire_request_change()
returns trigger
language plpgsql
security definer
as $$
begin
  perform realtime.send(
    jsonb_build_object('id', new.id, 'updated_at', new.updated_at),
    'changed',
    'hire_request:' || new.id,
    true
  );

  if tg_op = 'INSERT' then
    perform realtime.send(
      jsonb_build_object('id', new.id, 'service_id', new.service_id),
      'new_request',
      'user:' || new.provider_uid || ':incoming-requests',
      true
    );
  end if;

  return new;
end;
$$;

create or replace function public.broadcast_service_change()
returns trigger
language plpgsql
security definer
as $$
begin
  perform realtime.send(
    jsonb_build_object('id', coalesce(new.id, old.id), 'active', coalesce(new.active, old.active)),
    'service_changed',
    'services-feed',
    false
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.broadcast_notification_added()
returns trigger
language plpgsql
security definer
as $$
begin
  perform realtime.send(
    jsonb_build_object('id', new.id, 'kind', new.kind, 'created_at', new.created_at),
    'notification',
    'user:' || new.user_uid || ':notifications',
    true
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Triggers (idempotent)
-- ---------------------------------------------------------------------------
drop trigger if exists message_broadcast on public.messages;
create trigger message_broadcast
  after insert on public.messages
  for each row execute function public.broadcast_message_added();

drop trigger if exists hire_request_broadcast on public.hire_requests;
create trigger hire_request_broadcast
  after insert or update on public.hire_requests
  for each row execute function public.broadcast_hire_request_change();

drop trigger if exists services_feed_broadcast on public.services;
create trigger services_feed_broadcast
  after insert or update on public.services
  for each row execute function public.broadcast_service_change();

drop trigger if exists notification_broadcast on public.notifications;
create trigger notification_broadcast
  after insert on public.notifications
  for each row execute function public.broadcast_notification_added();

-- ---------------------------------------------------------------------------
-- 4. Realtime Authorization policies on realtime.messages
--    (role `authenticated`; the minted Pi JWT carries pi_uid)
-- ---------------------------------------------------------------------------
drop policy if exists "hire_request channel scoped to participants" on realtime.messages;
create policy "hire_request channel scoped to participants" on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() like 'hire_request:%'
    and public.is_hire_request_participant((split_part(realtime.topic(), ':', 2))::uuid)
  );

drop policy if exists "incoming hire requests channel scoped to provider" on realtime.messages;
create policy "incoming hire requests channel scoped to provider" on realtime.messages
  for select
  to authenticated
  using (realtime.topic() = ('user:' || (auth.jwt() ->> 'pi_uid') || ':incoming-requests'));

drop policy if exists "services feed is public" on realtime.messages;
create policy "services feed is public" on realtime.messages
  for select
  to anon, authenticated
  using (realtime.topic() = 'services-feed');

drop policy if exists "notifications channel scoped to owner" on realtime.messages;
create policy "notifications channel scoped to owner" on realtime.messages
  for select
  to authenticated
  using (realtime.topic() = ('user:' || (auth.jwt() ->> 'pi_uid') || ':notifications'));
