# Talse — Hackathon Backlog

Working list for the "top 2" push. Grouped by impact. Status tracks the
`hackathon/community` work; nothing here is committed to `main` yet.

## In progress (Batch 1b — notifications + inbox)

- [x] `lib/pi-platform.ts` — `subroute` is now required; malformed notices fail
      loudly before the network call; success logs `delivered/sent` so Pi's
      best-effort drops are visible instead of hidden.
- [x] `lib/notify.ts` — `notifyUsers()` persists every notice to the
      `notifications` table (Talse inbox) **and** best-effort pushes to Pi.
- [x] All 7 call sites migrated from `sendInAppNotifications` to `notifyUsers`.
- [x] Migration `supabase/migrations/012_in_app_notifications.sql` + RLS.
- [x] `GET/POST /api/notifications` (list + mark seen, scoped to the caller).
- [x] In-app bell + inbox (`components/services/notifications-inbox.tsx`).

## Next (Batch 2 — growth loop)

- [ ] `lib/pi-native.ts`: `Pi.openShareDialog` / `Pi.copyText` with
      `navigator.share` / clipboard fallbacks.
- [ ] Share buttons on service detail, provider profile, job receipt, profile.
- [ ] `/services/[id]` deep link so shared listings resolve.
- [ ] Public browse mode + PiNet subdomain (required submission item).
- [ ] Pi Public Chat Room + `Pi.openConversation` entry point.

## UX — messaging clarity (NEW)

- [ ] **The messaging feature still confuses users about how it works.** Make it
      obvious that Messages are a private, per-hire-request thread that only
      becomes available after a hire request is accepted — and show *how* to use
      them. Candidate fixes:
      - an explanatory empty state + first-run hint on the Messages tab and the
        hire-request detail ("Chat opens here once your request is accepted");
      - a one-time inline tip the first time a request is accepted;
      - a "How messaging works" help sheet reachable from the Messages tab;
      - clear labels distinguishing private DMs from the public Chat Room.

## Later / external

- [ ] Mainnet A2U payout access (apply + verify).
- [ ] Drop or use the unused `wallet_address` scope.
- [ ] Wire the Soroban escrow contract behind a feature flag.
- [ ] Tests (fee math, payout double-spend guard, sanitizers).
- [ ] Rewarded-ad → free boost.
- [ ] Performance: `setInterval` polling in the inbox is a placeholder until a
      realtime notifications channel exists.