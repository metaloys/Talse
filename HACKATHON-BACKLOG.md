# Talse — Hackathon Backlog

Working list for the "top 2" push. Grouped by impact. Everything below is on
`main` and deployed.

## Batch 1 — notifications + inbox (done)

- [x] `lib/pi-platform.ts` — `subroute` is now required; malformed notices fail
      loudly before the network call; success logs `delivered/sent` so Pi's
      best-effort drops are visible instead of hidden.
- [x] `lib/notify.ts` — `notifyUsers()` persists every notice to the
      `notifications` table (Talse inbox) **and** best-effort pushes to Pi.
- [x] All 8 call sites migrated from `sendInAppNotifications` to `notifyUsers`.
- [x] Migration `supabase/migrations/012_in_app_notifications.sql` + RLS.
- [x] `GET/POST /api/notifications` (list + mark seen, scoped to the caller).
- [x] In-app bell in each tab header (top-right) + inbox
      (`components/services/notification-bell.tsx`,
      `components/services/notifications-inbox.tsx`).

## Batch 2 — growth loop (done)

- [x] `lib/pi-native.ts`: `Pi.openShareDialog` / `Pi.copyText` with
      `navigator.share` / clipboard fallbacks; reports which path was used.
- [x] Share buttons on service detail, provider profile, completed job
      ("Share receipt") and own profile.
- [x] `/services/[id]` deep link so shared listings resolve, with OpenGraph
      metadata for chat previews.
- [x] `/providers/[id]` deep link + `GET /api/providers/[id]` so a shared
      profile opens on a cold device.
- [ ] Public browse mode + PiNet subdomain (required submission item).
- [ ] Pi Public Chat Room + `Pi.openConversation` entry point.

## Messaging clarity + live-ish updates (done — see `MESSAGING-PLAN.md`)

- [x] **Tier 1 — copy + feedback:** corrected the misleading "demo" empty state;
      conversation shows the counterpart's name; status pill reflects real
      status; failed sends now show an inline error with **Retry**; new-message
      notifications open the thread (`/messages/[id]`) instead of the request.
- [x] **Tier 2 — education:** "How messaging works" help sheet; explanatory empty
      state; "private · one thread per request" strip; hire-request detail tells
      the user when chat is available; explicit Messages-vs-Chat-Room wording.
- [x] **Tier 3 — structural:** messaging now opens at `pending` too (ask before
      accepting); unread tracking (`conversation_reads`, `/api/messages/unread`,
      `/api/messages/read`) with a Messages-tab badge and per-thread dots;
      merge-by-id refresh + 15 s thread poll + refresh-on-focus; removed the dead
      legacy conversation model.

## Later / external

- [ ] Mainnet A2U payout access (apply + verify).
- [ ] Drop or use the unused `wallet_address` scope.
- [ ] Wire the Soroban escrow contract behind a feature flag.
- [ ] Tests (fee math, payout double-spend guard, sanitizers).
- [ ] Rewarded-ad → free boost.
- [x] **Realtime (done — see `REALTIME.md`).** DB triggers publish signal-only
      broadcasts; `contexts/realtime-client-context.tsx` now authorizes the
      socket with `realtime.setAuth()` (the missing piece — `accessToken` alone
      never authorized private channels). Covered: messages, hire requests,
      services, notifications. Migration `015_realtime_broadcast.sql`.
- [ ] Optimise `/api/messages/unread` (currently scans messages for the user's
      requests; fine at hackathon scale, should become a counter/index later).