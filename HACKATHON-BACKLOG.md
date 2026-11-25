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
- [x] **Share always yields a link.** Tapping Share opens an in-app sheet with the
      full link, a **Copy link** button, and a native "Share with Pi"/"Share…"
      button when one exists. Fixes: the sandbox's `Pi.openShareDialog` resolves
      without showing anything, so the old code toasted "Shared" while the user
      got nothing. See `components/services/share-button.tsx`.
- [x] `/services/[id]` deep link so shared listings resolve, with OpenGraph
      metadata for chat previews.
- [x] `/providers/[id]` deep link + `GET /api/providers/[id]` so a shared
      profile opens on a cold device.
- [x] Public browse mode (guest mode, Phase 1): Pi sign-in is action-triggered,
      the app boots without `Pi.authenticate`, account-gated tabs/actions show
      an in-app sign-in CTA, `/privacy` & `/terms` stay auth-exempt. Verifies
      in `next build`; pending live serve on the PiNet subdomain.
- [ ] Serve public browse on the PiNet subdomain (deploy current build; test
      `pi_url` in Pi Browser once portal config is settled).
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

## Home / Feed redesign — marketplace-ready (done)

Goal: make the first screen sell the marketplace so a new Pioneer starts doing
business on day one.

- [x] **Search-forward hero** — value prop ("Hire Pi talent. Get real work done."),
      one-line promise, a prominent search bar that jumps to Search, and
      scrollable category chips.
- [x] **Trust band** — one deep violet surface stating the deal up front:
      Escrow-safe · Paid in Pi · Real reviews, plus live listing/Pioneer counts.
- [x] **Featured spotlight + rails** — full-width featured card (dark gradient,
      rating, provider, price, delivery) and Promoted / "Fresh on Talse"
      horizontal rails instead of a flat grid dump.
- [x] **Cards that sell** — provider avatar + name, ⭐ rating + review count,
      "N done", price and delivery; hover lift on desktop.
- [x] **Empty state** — "Be a founding provider" with a create CTA.
- [x] **Responsive shell** — `max-w-6xl`; Browse rows go two-up, Search results
      2/3/4-up. Mobile (Pi Browser) stays the primary target.

## App-wide redesign — Tier 1: shell + core tabs (done)

Goal: retire the "two apps" problem — the new Home/Search sat beside old narrow
`max-w-md` screens. Desktop strategy: responsive + a real desktop nav.

- [x] **Navigation system** — shared `NAV_ITEMS`; new desktop `TopNav` (logo,
      five tabs with live badges, bell, "Sell a service"), mobile `BottomNav`
      unchanged but now hidden from `lg` up. Both read the same items.
- [x] **Activity** — `max-w-6xl` shell, richer hero, request cards two-up on
      desktop, clearer Needs action / Active / Completed sections.
- [x] **Messages** — wide shell with a desktop two-pane layout (conversation
      list left, sticky thread right; "select a conversation" placeholder);
      mobile keeps list-then-thread.
- [x] **Profile** — wide hero, a Rating / Jobs / Active-services stat row,
      escrow financial summary, admin card beside it, and a two-up services
      grid with hover lift.

## App-wide redesign — Tier 2: detail, provider, hire, create (done)

Goal: make the conversion path — viewing, trusting, hiring and listing — feel
like a real marketplace at every step.

- [x] **Service detail** — `max-w-5xl`; desktop splits the gallery (left) from
      the details (right), the real listing title now titles the screen, an
      escrow "Payment breakdown" receipt (held / fee / provider receives / gas),
      a provider row that opens their profile, a three-up trust strip, and a
      wider sticky Hire bar.
- [x] **Provider profile** — gradient hero with avatar, join date, earnings
      badge and location; a Rating / Jobs / Success stat row; a two-up services
      grid of real listing cards; and a reviews panel with a rating
      distribution plus recent reviews.
- [x] **Hire flow** — two clear steps (Describe → Review & send) with a
      progress stepper; the review step shows an explicit escrow receipt and
      "you pay today: 0 π" so nothing is charged until the provider accepts.
- [x] **Escrow flow** — paying into escrow and releasing funds are no longer
      one click: each expands an inline confirmation receipt first.
- [x] **Create service** — a live preview column on desktop (and a
      "Show live preview" toggle on mobile) renders the exact listing card from
      the form as you type.

## App-wide redesign — Tier 3: reviews, notifications, trust, auth (done)

Goal: close the remaining surfaces so the app reads as a finished product —
readable reviews, a real inbox, careful money/trust flows, and a calm first
screen.

- [x] **Reviews** — rating summary card with a 5→1 distribution bar chart, a
      proper write-review flow (10-character minimum, live counter, success and
      error states), and a two-up review card grid with avatars and "Top rated"
      badges.
- [x] **Notifications** — bell + inbox now share one `useNotifications()` hook
      with per-item read, "Mark all read", live Realtime delivery and a 45 s
      poll fallback; every notice gets an icon/tone derived from its `subroute`
      and kind, plus unread styling and a relative timestamp.
- [x] **Report sheet** — bottom sheet on mobile / centred dialog on desktop,
      selectable reason rows with a check mark, a confidentiality note, a
      "false reports may affect your account" footer and a clear Send/Cancel.
- [x] **Disputes** — `max-w-2xl` layout, escrow-frozen explainer, per-dispute
      cards with amount held, reason, admin note and a Filed → Under review →
      Resolved timeline; the create form warns that filing freezes the escrow.
- [x] **Boost** — buying or extending a boost confirms inline (benefit, price,
      "charged once in the Pi payment sheet") before opening `Pi.createPayment`;
      active boosts show an "Active until …" chip with days left.
- [x] **Auth / loading** — on-brand `ps-hero-rich` first screen with the logo,
      tagline, spinner and auth message; a failed Pi handshake becomes a clear
      "Couldn't sign you in" card with a Try again button and Pi Browser hint.
- [x] **Shared primitives** — new read-only `Stars` primitive in `ui.tsx` used
      by reviews and profiles, keeping rating rendering consistent app-wide.

## Business model — revenue & costs (done)

- [x] **`v_platform_earnings` / `_daily` / `v_platform_accounting`** — lifetime,
      daily and per-order P&L straight from settled rows (`009`, `013`).
- [x] **Revenue & P&L console** — actuals, daily series, CSV export, Fees & Take
      Rate.
- [x] **Scenario planner** — every assumption editable (Pi price, 5%/10% fee,
      jobs, average value, boosts, refunds, growth, network fee, infra), revenue
      split by source, break-even and payback, monthly π/USD table, CSV export.
- [x] **`pi_usd_rate`** — persisted, audited Pi→USD reporting assumption
      (migration `016`); USD figures are derived, never claimed as quotes.
- [x] **`submission/REVENUE-COSTS.md`** — written report: assumptions, per-unit
      economics, 12-month base case, revenue by source, costs, break-even and
      sensitivity, with disclosures.

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