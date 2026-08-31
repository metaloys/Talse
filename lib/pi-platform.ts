/**
 * Server-side calls to the Pi Platform API for Server-Side Approval and
 * Server-Side Completion, per:
 * https://github.com/pi-apps/pi-platform-docs/blob/master/payments.md
 *
 * Uses PI_API_KEY (your app's server API key from the Pi Developer Portal —
 * distinct from the user access token). Never expose this key to the client.
 */

const PI_PLATFORM_API_BASE = "https://api.minepi.com/v2";

function authHeaders() {
  if (!process.env.PI_API_KEY) throw new Error("PI_API_KEY is not set");
  return { Authorization: `Key ${process.env.PI_API_KEY}`, "Content-Type": "application/json" };
}

export async function approvePayment(paymentId: string) {
  const res = await fetch(`${PI_PLATFORM_API_BASE}/payments/${paymentId}/approve`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Pi approve failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export async function completePayment(paymentId: string, txid: string) {
  const res = await fetch(`${PI_PLATFORM_API_BASE}/payments/${paymentId}/complete`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ txid }),
  });
  if (!res.ok) throw new Error(`Pi complete failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export async function getPayment(paymentId: string) {
  const res = await fetch(`${PI_PLATFORM_API_BASE}/payments/${paymentId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Pi get-payment failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export async function getIncompleteServerPayments() {
  const res = await fetch(`${PI_PLATFORM_API_BASE}/payments/incomplete_server_payments`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Pi get-incomplete-server-payments failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  // Expecting shape: { incomplete_server_payments: [ ... ] }
  return json.incomplete_server_payments ?? [];
}

export async function cancelPayment(paymentId: string) {
  const res = await fetch(`${PI_PLATFORM_API_BASE}/payments/${paymentId}/cancel`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Pi cancel failed (${res.status}): ${await res.text()}`);
  return res.json();
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
  });
  if (!res.ok) throw new Error(`Pi A2U create failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  // Development-only: log the raw payment shape so callers can confirm
  // which field contains the recipient/steller address. DO NOT log secrets.
  // Do not log payment responses here. Leave any inspection to temporary
  // developer instrumentation in the caller; never emit payment objects by
  // default from this central helper.
  return json;
}
