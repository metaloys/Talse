# Realtime in Talse

How live updates work, and how to add them to a new feature.

## TL;DR

- **Publishers live in the database.** Triggers call `realtime.send(...)` after a
  write. Any writer — API route, admin console, SQL, or a future feature — fires
  them automatically.
- **Payloads are signal-only** (`id`, timestamps). Clients never trust them for
  content; they re-fetch through the authenticated API, which re-checks
  permissions.
- **Clients subscribe** with the shared client from `useRealtimeClient()`. The
  provider authorizes the socket; you don't call `setAuth` yourself.
- **Polling stays as a fallback**, so a dropped socket degrades instead of
  breaking.

## Topics and events

| Topic | Event | Private | Sent when |
|---|---|---|---|
| `services-feed` | `service_changed` | no | a service is created/updated |
| `hire_request:<id>` | `message_added` | yes | a message is inserted |
| `hire_request:<id>` | `changed` | yes | a hire request is inserted/updated |
| `user:<provider_uid>:incoming-requests` | `new_request` | yes | a hire request is created |
| `user:<uid>:notifications` | `notification` | yes | a notification is inserted |

Defined in `supabase/migrations/015_realtime_broadcast.sql`.

## Why it used to be dead

Two independent faults:

1. **No publisher.** The client subscribed to broadcast channels, but nothing
   ever sent to them.
2. **No Realtime authorization.** `createClient(..., { accessToken })` does *not*
   authorize Realtime channels. A private channel joined before an explicit
   `realtime.setAuth(token)` gets `CHANNEL_ERROR`, permanently. Fixed in
   `contexts/realtime-client-context.tsx`, which now waits for the token and
   `await`s `setAuth` **before** exposing the client to subscribers.

The minted token is a Supabase-compatible ES256 JWT carrying
`{ role: "authenticated", pi_uid }` (`lib/realtime-auth.ts`). It is refreshed
every ~8 min and lives 1 h.

## Add realtime to a new feature

Assume a new table `deliverables` that should update the buyer live.

### 1. Broadcast it (migration)

```sql
create or replace function public.broadcast_deliverable_added()
returns trigger language plpgsql security definer as $$
begin
  perform realtime.send(
    jsonb_build_object('id', new.id, 'hire_request_id', new.hire_request_id),
    'deliverable_added',
    'hire_request:' || new.hire_request_id,   -- reuse an existing topic
    true
  );
  return new;
end; $$;

create trigger deliverable_broadcast
  after insert on public.deliverables
  for each row execute function public.broadcast_deliverable_added();
```

### 2. Authorize it (only for a new private topic)

Policies live on `realtime.messages` and read `auth.jwt() ->> 'pi_uid'`:

```sql
create policy "deliverables topic scoped to participant" on realtime.messages
  for select to authenticated
  using (
    realtime.topic() like 'deliverable:%'
    and public.is_hire_request_participant((split_part(realtime.topic(), ':', 2))::uuid)
  );
```

Reusing `hire_request:<id>` needs no new policy — it already admits the buyer and
provider.

### 3. Subscribe on the client

```tsx
const realtime = useRealtimeClient();

useEffect(() => {
  if (!realtime) return;
  const channel = realtime.channel(`hire_request:${id}`, { config: { private: true } });
  channel.on("broadcast", { event: "deliverable_added" }, () => void refetch());
  channel.subscribe();
  return () => { try { channel.unsubscribe(); } catch {} };
}, [realtime, id]);
```

Keep a poll as the fallback. Never render payload data directly.

## Rules of thumb

- Topic names that contain a uid/request id are unguessable UUIDs; still, treat
  them as metadata only.
- Never put private content (message text, amounts, emails) in a payload.
- Delete/expiry events are just more signals — re-fetch to learn the truth.
- One socket per app; the client is lazily imported and shared via context.