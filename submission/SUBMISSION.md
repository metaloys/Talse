# Talse — Pi Hackathon submission pack

> Hire and offer services with Pi.

This folder is the copy + asset checklist for the Pi Hackathon submission. Fill
the `TODO` links once the assets are uploaded.

---

## 1. One-liners

- **Name:** Talse
- **Tagline:** Hire and offer services with Pi.
- **One-sentence pitch:** Talse is a Pi-native services marketplace where Pioneers
  hire each other for real work — design, writing, development, video, tutoring —
  with Pi payments and escrow built in.
- **Short description (≤ 160 chars):**
  Talse is a Pi-native marketplace to hire and offer services — real work, paid
  in Pi, with escrow, reviews, and live messaging.

## 2. Long description

Talse turns the Pi community into a working economy. Instead of scrolling a feed
of promises, Pioneers can list what they do, get hired, deliver the work, and get
paid in Pi — inside Pi Browser.

Every listing is a real service with a price, delivery time, portfolio images and
a provider profile with ratings and completed-job history. A buyer sends a hire
request, the two sides agree on scope in a private per-request thread, and Pi
escrow holds the payment until delivery. When the work is done the provider is
paid, the buyer leaves a review, and the provider's reputation grows.

The app is built around the "Pi builders hiring Pi builders" loop: the people who
build on Pi are exactly the people who need design, copy, code and video — so the
marketplace starts with a community that already trusts the same currency.

## 3. Why it matters

- **Pi needs a place to spend Pi on real work.** Talse gives Pioneers a way to
  earn and spend Pi on services with a clear scope and a receipt.
- **Trust is the bottleneck.** Escrow, reviews, provider history, and a private
  message thread per job make a first-time hire safe.
- **Distribution is built in.** Every listing, provider and receipt is shareable
  with a working deep link, so providers can bring their own customers.

## 4. Key features

| Feature | What it does |
|---|---|
| Marketplace | Browse/search services by category, price, delivery time and rating. |
| Provider profiles | Bio, portfolio, rating, reviews, completed jobs, active listings. |
| Hire requests | Send a request, agree scope, accept, deliver, release. |
| Pi escrow | Payment is held and released on delivery (see Pi integration). |
| Private messaging | One private thread per hire request, with attachments and unread badges. |
| Notifications | In-app inbox + bell + Pi Notification Center push. |
| Realtime | Messages, requests, listings and notifications update live. |
| Boosts | Providers can promote a listing for a period, paid in Pi. |
| Share / invite | Share a listing, provider, receipt or profile with a deep link. |
| Admin console | RBAC-gated operations: moderation, disputes, payouts, audit log. |

## 5. How it uses Pi

- **Pi Browser authentication** — Pioneers sign in with their Pi identity; the app
  verifies the Pi access token server-side.
- **Pi payments / escrow** — hire payments are approved and completed through the
  Pi payment flow; the platform fee is explicit and shown before confirming.
- **Boosts** — a listing boost is a Pi payment validated by payment metadata.
- **Pi Notification Center** — best-effort push alongside Talse's own inbox, so a
  dropped push never hides an update.
- **Native share** — uses Pi's share dialog where available, with web/clipboard
  fallbacks.

> Sandbox vs. mainnet: payments run in the Pi sandbox for the hackathon build.
> Mainnet payout access is tracked separately and not claimed here.

## 6. Target users and use cases

1. **A Pi builder needs a logo** — searches "design", compares price/rating,
   hires, pays in Pi, reviews.
2. **A writer offers articles** — lists a service, gets hired, delivers in the
   private thread, gets paid and reviewed.
3. **A provider brings a customer** — shares the listing link into a Pi chat; the
   recipient lands on the exact service and can hire.
4. **A returning buyer** — the bell and unread badge tell them what needs a reply.

## 7. How it was built

- **Next.js 15** (App Router) + React, TypeScript, Tailwind.
- **Supabase** (Postgres, storage, Realtime) with row-level security.
- **Pi Platform API** for auth, payments, notifications.
- **Realtime**: database triggers broadcast signal-only events; the client
  authorizes its socket with a short-lived minted JWT (see `REALTIME.md`).
- Every change is gated by `tsc --noEmit`, `eslint`, and a production build.

## 8. Demo video outline (≤ 3 min)

1. **0:00–0:15** — What Talse is, one sentence, logo + tagline.
2. **0:15–0:45** — Browse the marketplace: categories, search, a listing with
   photos, price, delivery, provider rating.
3. **0:45–1:20** — Hire flow: send a request, private thread, agree scope.
4. **1:20–1:50** — Pay with Pi (sandbox), escrow explanation, delivery + release.
5. **1:50–2:15** — Review, provider reputation updates.
6. **2:15–2:35** — Growth loop: share a listing/receipt; recipient lands on it;
   bell/unread updates live.
7. **2:35–2:55** — Close: "Pi builders hiring Pi builders", links, call to action.

## 9. Asset checklist

- [ ] Logo (app icon) — `submission/logo.png`
- [ ] Screenshots / previews — `submission/previews/` (Home, listing, checkout,
      messages, profile)
- [ ] Demo video (≤ 3 min, English) — TODO link
- [ ] Business model — [`REVENUE-COSTS.md`](./REVENUE-COSTS.md) (π + USD, editable assumptions)
- [ ] App URL — https://talse.vercel.app
- [ ] Pi Browser / sandbox URL — https://sandbox.minepi.com/mobile-app/ui/app/vendrapi-xmax

## 10. Copy for the submission form

**What problem does it solve?**
Pioneers can earn Pi but have few trusted places to spend it on real work.
Hiring a stranger online is risky: unclear scope, no proof of delivery, no
recourse. Talse makes a first hire safe with escrow, reviews, provider history
and a private thread per job.

**What is novel?**
It is Pi-native end to end: Pi login, Pi payments and escrow, Pi notifications,
and native sharing — wrapped in a marketplace designed for the Pi builder
community. The growth loop is people hiring people they already share a currency
with.

**What's next?**
Public browse mode (so shared links work outside Pi Browser), true realtime
everywhere, richer provider portfolios, and dispute resolution tooling.

---

## 11. Business model

Talse earns from two sources, reported separately in
[`REVENUE-COSTS.md`](./REVENUE-COSTS.md):

1. **Job completion fee** — 5% or 10% of each released job (a platform setting).
2. **Listing boosts** — a one-time Pi payment that promotes a listing for 7 days.

Every figure is quoted in **π and USD**. The Pi→USD rate is an editable, versioned
platform setting (Configuration → "Pi price (USD)"), so every projection can be
re-run at a different rate without touching historical ledger rows. The admin
Revenue & P&L screen ships a live scenario planner with the same maths and a CSV
export.