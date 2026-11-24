-- ============================================================================
-- In-app notifications (hackathon/community — Batch 1b)
--
-- Every notification we attempt to deliver to a Pioneer is persisted here so it
-- can be shown inside Talse's own Inbox. Pi's Notification Center delivery is
-- best-effort and requires the recipient to have granted the
-- `in_app_notifications` scope, so this table is the durable source of truth
-- for "what did we tell this user" even when Pi drops the push.
--
-- Server-only: all reads/writes go through the Next.js API routes using the
-- Supabase service-role key, after verifying the Pi access token against
-- /me. RLS is enabled with no permissive policy (see supabase/policies.sql),
-- so the anon key cannot read another user's notifications.
-- ============================================================================

create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_uid    text not null,                       -- recipient (Pi app-scoped uid)
  title       text not null,
  body        text not null,
  subroute    text not null,                       -- in-app route to open, e.g. /hire-requests/<id>
  kind        text not null default 'general',     -- coarse category for icon/label
  related_id  text,                                -- hire_request_id / service_id, when known
  seen_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_notifications_user_created
  on notifications(user_uid, created_at desc);

create index if not exists idx_notifications_user_unseen
  on notifications(user_uid)
  where seen_at is null;
