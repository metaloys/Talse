# Messaging overhaul — plan (Tiers 1 → 3)

Status: **code-complete** (branch `hackathon/community`) — awaiting migration `014` + Pi Browser test

The goal is to make the private, per-hire-request messaging understandable and
usable, then make it feel live. Work is done in three tiers, lowest risk first.

---

## Tier 1 — quick wins (copy + feedback) ✅

| # | Change | File |
|---|---|---|
| 1 | Replace the stale, misleading empty-state copy ("Demo messages are not real-time or shared"). | `components/services/messages-screen.tsx` |
| 2 | Show the **counterpart's name** as the conversation headline, service title secondary. | same |
| 3 | Status pill reflects the real status (`STATUS_META`), not a hard-coded success tone. | same |
| 4 | **Surface send failures** with a visible error + Retry (previously `state === "error"` rendered nothing). | same |
| 5 | New-message notifications open the **thread**, not the request card. | `app/api/messages/route.ts`, `app/messages/[id]/page.tsx` (new), `components/services/services-app.tsx` |

## Tier 2 — clarity / education ✅

| # | Change | File |
|---|---|---|
| 1 | "How messaging works" help sheet: private, one thread per hire request, who can see it, and Messages vs. a future public Chat Room. | `components/services/messages-screen.tsx` |
| 2 | Explanatory empty state + inline "private · one thread per request" strip. | same |
| 3 | Hire-request detail tells the user when chat opens. | `components/services/activity-screen.tsx` |

## Tier 3 — structural ✅

| # | Change | File |
|---|---|---|
| 1 | **Pre-hire contact**: messaging available from `pending` too, so a buyer can ask a question before accepting (server already allowed it; only the client gated it). | `components/services/messages-screen.tsx`, `components/services/activity-screen.tsx` |
| 2 | **Unread tracking**: `conversation_reads` table, `/api/messages/unread` + `/api/messages/read`, unread badge on the Messages tab and per-conversation dots. | `supabase/migrations/014_conversation_reads.sql` (new), `app/api/messages/unread/route.ts` (new), `app/api/messages/read/route.ts` (new), `lib/backend-api.ts`, `components/services/use-unread-messages.ts` (new), `components/services/bottom-nav.tsx`, `components/services/services-app.tsx` |
| 3 | **Live-ish updates**: merge-by-id message refresh (so a poll never drops loaded history), a 15 s thread poll while open, and refresh-on-visibility for requests/services. | `contexts/services-context.tsx`, `components/services/messages-screen.tsx` |
| 4 | Delete the dead legacy conversation model (`sanitizeMessage*`, `messagesToBlob`, unused `ConversationMessage` fields). | `lib/services/data.ts`, `contexts/services-context.tsx` |

---

## Realtime audit (answer to "does the whole app update live?")

**Short answer: no.** The app *subscribes* to realtime, but nothing *publishes*,
so those subscriptions never fire.

- The client opens three Supabase **broadcast** channels:
  - `services-feed` (public) — `contexts/services-context.tsx`
  - `user:<uid>:incoming-requests` (private)
  - `hire_request:<id>` (private)
- There is **no server-side broadcaster**: no `channel.send(...)`, no
  `postgres_changes` subscription, and no DB trigger that publishes a broadcast.
  `supabase/migrations/004_realtime_participant_auth.sql` only defines the
  *authorization* rule; it does not send anything.
- What actually keeps the app current today:
  - one fetch on boot (services, profile, requests);
  - local state updates after the user's own actions;
  - the inbox polls every 45 s (added in Batch 1);
  - Tier 3 adds refresh-on-focus for requests/services and a 15 s poll on the
    open thread.

So other people's changes are **not** pushed live. To get true realtime, the
server must publish (broadcast from the API routes after a write, or a DB
trigger), plus the Realtime authorization policies must be configured in the
Supabase project. Until then, focus/poll refresh is the honest fallback.