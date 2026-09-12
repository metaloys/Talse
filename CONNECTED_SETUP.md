# Talse — Connected Build

This is the frontend from the original upload, wired to the Supabase +
Next.js API backend. See `README.md` (the original backend doc, if present)
for the deeper architecture notes; this file is the checklist to actually
get it running.

## 1. Install

```bash
npm install
```

## 2. Environment

Copy `.env.example` to `.env.local` and fill in:

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
PI_API_KEY=...
```

- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`: from your Supabase project
  settings (Project Settings → API).
- `PI_API_KEY`: from the Pi Developer Portal, your app's settings — this is
  the server-side key, distinct from any client-side app ID.

## 3. Database

In the Supabase SQL editor, run `supabase/schema.sql` then
`supabase/policies.sql`.

## 4. What changed vs. the original upload

| File | Change |
|---|---|
| `contexts/pi-auth-context.tsx` | Added a real `window.Pi.authenticate()` call → `accessToken` / `piUser` now exposed via `usePiAuth()` |
| `lib/backend-api.ts` | **New.** Typed client for every backend route |
| `lib/pi-verify.ts`, `lib/pi-platform.ts`, `lib/supabase-server.ts` | **New.** Server-side trust boundary + Pi Platform API calls |
| `app/api/*` | **New.** All backend routes (services, hire-requests, payments, messages, reviews) |
| `contexts/services-context.tsx` | Rewritten: listings/requests/messages now come from the backend instead of the missing shared SDK store. Same external interface, write methods are now `async` |
| `lib/services/data.ts` | `RequestStatus` widened to the real escrow lifecycle; `STATUS_META` updated to match |
| `components/services/create-service.tsx`, `messages-screen.tsx`, `profile-screen.tsx`, `activity-screen.tsx` | Updated call sites for the now-async context methods |
| `components/services/escrow-actions.tsx` | **New.** Real `Pi.createPayment()` escrow lock, plus deliver/release/dispute actions |
| `components/services/boost-listing.tsx` | Now confirms the purchase with the backend so `boosted_until` actually gets set |
| `lib/sdklite-types.ts` | Added `authenticate`/`createPayment` to the `window.Pi` type |
| `contracts/escrow/` | The Soroban escrow contract — not yet callable from the client (see below) |
| `components/services/dispute-resolution.tsx` | Rewritten from a mock (hardcoded `MOCK_DISPUTES`) to real data: admin workspace lists/resolves actual disputed hire requests, "My disputes" files real disputes against real requests |
| `lib/admin.ts`, `lib/dispute-resolution.ts` | **New.** Admin gate (`ADMIN_PI_UIDS`) and the shared escrow payout helper used by release/refund/dispute-resolve |
| `app/api/admin/disputes/*` | **New.** List all disputes, update stage/note, and resolve (release or refund) — admin-only |
| `app/api/hire-requests/[id]/route.ts` | `PATCH` now accepts `reason`/`details`/`evidence` when filing a dispute |

## 6. Dispute resolution — how it works

- Either party can file a dispute on a `locked` or `delivered` hire request
  (via `EscrowActions`' Dispute button, or the richer form in "My disputes").
- Set `ADMIN_PI_UIDS` in your environment to the Pi uid(s) of your platform
  admins. Anyone not on that list sees "Admin access required" instead of
  the admin workspace — this is enforced server-side in `lib/admin.ts`, not
  just hidden in the UI.
- Resolving a dispute (`Resolve — refund buyer` / `Reject — release to
  provider`) calls the same `payoutHireRequest()` helper as the normal
  release/refund flow, so it's the same custodial A2U payment today, with
  the same contract-swap seam noted in §5.

## 5. What's still open

- **Native smart contract escrow isn't wired into the UI.** As discussed,
  Pi's public client SDK doesn't yet expose a contract-invoke method — only
  `Pi.createPayment()`, which is what `escrow-actions.tsx` actually uses
  today (a custodial lock/release via your app's own Pi wallet, per
  `app/api/hire-requests/[id]/release/route.ts`). `contracts/escrow/` is
  ready to build/test/deploy on your machine (see the Rust toolchain notes
  in its own directory) and is the intended swap-in once Protocol 27 ships
  and the client SDK catches up.
- **Dispute resolution has no admin UI yet.** `resolve_dispute` exists on
  the contract, and `refund()` exists as a backend route, but nothing in
  the frontend currently calls it — `admin-panel.tsx` would be the natural
  place to add a "resolve in favor of buyer/provider" action.
- **Boost confirmation failure isn't retried.** If the Pi purchase succeeds
  but the follow-up call to `/api/services/[id]/boost` fails (network
  blip, etc.), the user sees success but `boosted_until` never gets set.
  Fine for a v1; worth a reconciliation job or webhook later.
- **Test with real Pi Testnet credentials** before trusting this with real
  Pi — none of the payment or auth flows can be exercised from a sandbox;
  they need the actual Pi Browser environment.
