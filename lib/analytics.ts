// Client-side product analytics.
//
// Events are queued in memory and flushed in small batches to POST /api/events.
// Tracking is best-effort: it must never throw, never block a user action, and
// never retry storms. If the token is missing or the request fails, events are
// dropped silently.

type Props = Record<string, string | number | boolean | null | undefined>;

type QueuedEvent = { name: string; props: Props };

const MAX_BATCH = 10;
const MAX_QUEUE = 50;
const FLUSH_DELAY_MS = 2000;

let token: string | null = null;
let sessionId: string | null = null;
let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;
let lastAppOpenAt = 0;

function makeSessionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

function bindLifecycle() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  // Flush what is queued when the app is backgrounded or closed.
  window.addEventListener("pagehide", () => flushEvents(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushEvents(true);
  });
}

/** Called by the Pi auth context whenever the access token changes. */
export function setAnalyticsToken(value: string | null | undefined) {
  const next = value && value.trim() ? value.trim() : null;
  if (next === token) return;
  token = next;
  if (!token) {
    queue = [];
    return;
  }
  if (typeof window !== "undefined") {
    sessionId = sessionId ?? makeSessionId();
    bindLifecycle();
    if (queue.length > 0) void flushEvents();
  }
}

/** Queue an event. Safe to call from anywhere; no-ops before sign-in. */
export function track(name: string, props: Props = {}) {
  if (typeof window === "undefined" || !token) return;
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(name)) return;

  const cleaned: Props = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === "") continue;
    if (typeof value === "string" && value.length > 200) {
      cleaned[key] = value.slice(0, 200);
    } else {
      cleaned[key] = value;
    }
  }

  queue.push({ name, props: cleaned });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);

  if (queue.length >= MAX_BATCH) {
    void flushEvents();
    return;
  }
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flushEvents();
  }, FLUSH_DELAY_MS);
}

/** Send everything currently queued. Never throws. */
export async function flushEvents(keepalive = false) {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!token || queue.length === 0) return;

  const batch = queue.slice(0, MAX_BATCH);
  queue = queue.slice(batch.length);
  const authToken = token;

  try {
    await fetch("/api/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ events: batch, sessionId }),
      keepalive,
    });
  } catch {
    // Drop on failure: analytics never retries or surfaces errors.
  }

  if (queue.length >= MAX_BATCH) void flushEvents(keepalive);
}

/** True once a token is set and events will actually be sent. */
export function isTracking() {
  return typeof window !== "undefined" && token !== null;
}

/**
 * Fire app_open at most once per page load (session), so tab switches do not
 * inflate the funnel.
 */
export function trackAppOpen(props: Props = {}) {
  if (!isTracking()) return;
  const now = Date.now();
  if (lastAppOpenAt && now - lastAppOpenAt < 60_000) return;
  lastAppOpenAt = now;
  track("app_open", props);
}
