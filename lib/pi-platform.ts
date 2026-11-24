/**
 * Server-side calls to the Pi Platform API for Server-Side Approval and
 * Server-Side Completion, per:
 * https://github.com/pi-apps/pi-platform-docs/blob/master/payments.md
 *
 * Uses PI_API_KEY (your app's server API key from the Pi Developer Portal —
 * distinct from the user access token). Never expose this key to the client.
 */

import { PI_PLATFORM_API_BASE } from "@/lib/pi-env";

function authHeaders() {
  if (!process.env.PI_API_KEY) throw new Error("PI_API_KEY is not set");
  return { Authorization: `Key ${process.env.PI_API_KEY}`, "Content-Type": "application/json" };
}

function withTimeoutSignal(ms?: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(ms ?? process.env.PI_FETCH_TIMEOUT_MS ?? 8000));
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

export async function approvePayment(paymentId: string) {
  const sig = withTimeoutSignal();
  try {
    const res = await fetch(`${PI_PLATFORM_API_BASE}/payments/${paymentId}/approve`, {
      method: "POST",
      headers: authHeaders(),
      signal: sig.signal,
    });
    if (!res.ok) throw new Error(`Pi approve failed (${res.status}): ${await res.text()}`);
    return res.json();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("Pi approve timed out");
    throw err;
  } finally {
    sig.clear();
  }
}

export async function completePayment(paymentId: string, txid: string) {
  const sig = withTimeoutSignal();
  try {
    const res = await fetch(`${PI_PLATFORM_API_BASE}/payments/${paymentId}/complete`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ txid }),
      signal: sig.signal,
    });
    if (!res.ok) throw new Error(`Pi complete failed (${res.status}): ${await res.text()}`);
    return res.json();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("Pi complete timed out");
    throw err;
  } finally {
    sig.clear();
  }
}

export async function getPayment(paymentId: string) {
  const sig = withTimeoutSignal();
  try {
    const res = await fetch(`${PI_PLATFORM_API_BASE}/payments/${paymentId}`, {
      headers: authHeaders(),
      signal: sig.signal,
    });
    if (!res.ok) throw new Error(`Pi get-payment failed (${res.status}): ${await res.text()}`);
    return res.json();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("Pi get-payment timed out");
    throw err;
  } finally {
    sig.clear();
  }
}

export async function getIncompleteServerPayments() {
  const sig = withTimeoutSignal();
  try {
    const res = await fetch(`${PI_PLATFORM_API_BASE}/payments/incomplete_server_payments`, {
      headers: authHeaders(),
      signal: sig.signal,
    });
    if (!res.ok) throw new Error(`Pi get-incomplete-server-payments failed (${res.status}): ${await res.text()}`);
    const json = await res.json();
    // Expecting shape: { incomplete_server_payments: [ ... ] }
    return json.incomplete_server_payments ?? [];
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("Pi get-incomplete-server-payments timed out");
    throw err;
  } finally {
    sig.clear();
  }
}

export async function cancelPayment(paymentId: string) {
  const sig = withTimeoutSignal();
  try {
    const res = await fetch(`${PI_PLATFORM_API_BASE}/payments/${paymentId}/cancel`, {
      method: "POST",
      headers: authHeaders(),
      signal: sig.signal,
    });
    if (!res.ok) throw new Error(`Pi cancel failed (${res.status}): ${await res.text()}`);
    return res.json();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("Pi cancel timed out");
    throw err;
  } finally {
    sig.clear();
  }
}

/**
 * Creates an app-to-user (A2U) payment — used for the release/refund leg of
 * the escrow flow, paying the app's own Pi wallet balance out to a provider
 * or back to a buyer. Requires the app wallet's private seed to sign, done
 * via the Stellar SDK against Pi's horizon-compatible endpoint — see
 * lib/pi-a2u.ts for the signing implementation.
 */
export async function createA2UPayment(params: {
  uid: string; // recipient's Pi app-scoped uid
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
}) {
  const sig = withTimeoutSignal();
  try {
    const res = await fetch(`${PI_PLATFORM_API_BASE}/payments`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        payment: {
          amount: params.amount,
          memo: params.memo,
          metadata: params.metadata,
          uid: params.uid,
        },
      }),
      signal: sig.signal,
    });
    if (!res.ok) throw new Error(`Pi A2U create failed (${res.status}): ${await res.text()}`);
    const json = await res.json();
    // Development-only: log the raw payment shape so callers can confirm
    // which field contains the recipient/steller address. DO NOT log secrets.
    // Do not log payment responses here. Leave any inspection to temporary
    // developer instrumentation in the caller; never emit payment objects by
    // default from this central helper.
    return json;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("Pi A2U create timed out");
    throw err;
  } finally {
    sig.clear();
  }
}

/**
 * One in-app notification for the Pi Platform API.
 *
 * `subroute` is REQUIRED by Pi (it must start with "/") because that is the
 * route the Pi App opens when the user taps the notification. Making it
 * required here means a malformed notice fails loudly and immediately instead
 * of being silently rejected by Pi with a 422.
 */
export type InAppNotification = {
  title: string;
  body: string;
  user_uid: string;
  subroute: string;
};

export type InAppNotificationResult = {
  sent: number;
  delivered: number;
  delivered_notifications: unknown[];
  [key: string]: unknown;
};

export async function sendInAppNotifications(
  notifications: InAppNotification[]
): Promise<InAppNotificationResult> {
  if (!Array.isArray(notifications)) throw new Error("notifications must be an array");
  if (notifications.length === 0) return { sent: 0, delivered: 0, delivered_notifications: [] };
  if (notifications.length > 256) throw new Error("Too many notifications; max 256 at once");

  // Fail before the network call on the two things Pi rejects: missing
  // subroute, or one that doesn't start with "/".
  for (const n of notifications) {
    if (!n.subroute || typeof n.subroute !== "string" || !n.subroute.startsWith("/")) {
      throw new Error(`In-app notification needs a subroute starting with "/" (got ${JSON.stringify(n.subroute)})`);
    }
  }

  const sig = withTimeoutSignal();
  try {
    const res = await fetch(`${PI_PLATFORM_API_BASE}/in_app_notifications/notify`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ notifications }),
      signal: sig.signal,
    });
    if (!res.ok) throw new Error(`Pi notify failed (${res.status}): ${await res.text()}`);
    const json: Record<string, unknown> = await res.json().catch(() => ({}));
    // Pi delivery is best-effort per user: a recipient who never granted the
    // `in_app_notifications` scope (or disabled them in the Pi App) is dropped
    // from `delivered_notifications` with NO error. Report the real ratio so
    // this is visible in logs instead of masquerading as success.
    const delivered = Array.isArray(json.delivered_notifications) ? json.delivered_notifications : [];
    if (delivered.length < notifications.length) {
      console.warn(
        `[Pi notify] delivered ${delivered.length}/${notifications.length} in-app notifications ` +
          `(the rest were dropped — usually the recipient has not granted the in_app_notifications scope)`
      );
    }
    return { ...json, sent: notifications.length, delivered: delivered.length, delivered_notifications: delivered };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("Pi notify timed out");
    throw err;
  } finally {
    sig.clear();
  }
}
