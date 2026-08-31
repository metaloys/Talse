import { supabaseAdmin } from "@/lib/supabase-server";
import { createA2UPayment, completePayment, getIncompleteServerPayments, cancelPayment } from "@/lib/pi-platform";
import { submitA2UPayment } from "@/lib/pi-a2u";

export class PayoutNotConfiguredError extends Error {
  status = 503;
  constructor() {
    super("Payouts aren't live yet: PI_APP_WALLET_SEED is not configured.");
    this.name = "PayoutNotConfiguredError";
  }
}

function requirePayoutSigner(): string {
  const seed = process.env.PI_APP_WALLET_SEED?.trim();
  if (!seed) throw new PayoutNotConfiguredError();
  return seed;
}

/**
 * Pays out an escrowed hire_request — to the provider (release) or back to
 * the buyer (refund). Shared by:
 *   - app/api/hire-requests/[id]/release (buyer self-service)
 *   - app/api/hire-requests/[id]/refund (buyer/provider self-service)
 *   - app/api/admin/disputes/[id]/resolve (admin dispute resolution)
 *
 * ⚠️ Same CONTRACT SEAM note as the routes that call this: swap the
 * createA2UPayment() call for a deployed escrow contract's release()/
 * refund() once the Pi client SDK exposes contract invocation.
 */
export async function payoutHireRequest(params: {
  hireRequestId: string;
  favor: "provider" | "buyer";
  resolvedBy?: string; // admin uid, when this is a dispute resolution
}) {
  const { data: hr, error: fetchErr } = await supabaseAdmin
    .from("hire_requests")
    .select("id, buyer_uid, provider_uid, amount, status")
    .eq("id", params.hireRequestId)
    .single();
  if (fetchErr || !hr) throw new Error("Hire request not found");

  requirePayoutSigner();

  const recipient = params.favor === "provider" ? hr.provider_uid : hr.buyer_uid;
  // NOTE: Per safety requirements, failures here must fail fast — do NOT
  // fall through to creating a new payment when listing or cancelling fails.
  const incomplete = await getIncompleteServerPayments();
  // Diagnostic (brief#20): print raw incomplete payments and the computed match
  // Note: this logs metadata only, no secrets.
  // eslint-disable-next-line no-console
  console.debug("[Payout] incomplete payments:", JSON.stringify(incomplete));

  const match = (incomplete || []).find((p: any) => p?.metadata?.hireRequestId === hr.id);
  // eslint-disable-next-line no-console
  console.debug("[Payout] match for hr.id =", hr.id, ":", JSON.stringify(match));
  if (match) {
    const identifier = match.id ?? match.identifier;
    const txVerified = Boolean(match?.status?.transaction_verified === true);
    if (txVerified) {
      // Funds already moved on-chain; use the existing txid to complete the
      // payment server-side and then continue to DB update without creating
      // or submitting another transaction.
      const txid = match?.transaction?.txid ?? match?.transaction?.hash ?? null;
      if (!txid) {
        throw new Error("Found transaction-verified payment but missing txid for completion");
      }
    
      // Complete on Pi Platform using existing txid
      await completePayment(identifier, txid);

      // Update DB and return early following the same path as a normal
      // completed payment below. We reuse the txid as the release/refund id.
      const txidFinal = txid;
      const update: Record<string, unknown> =
        params.favor === "provider"
          ? { status: "released", release_txid: txidFinal }
          : { status: "refunded", refund_txid: txidFinal };

      if (params.resolvedBy) {
        update.resolved_by = params.resolvedBy;
        update.resolved_favor = params.favor;
        update.dispute_stage = "resolved";
      }

      const { data, error } = await supabaseAdmin
        .from("hire_requests")
        .update(update)
        .eq("id", params.hireRequestId)
        .eq("status", hr.status)
        .select()
        .single();
      if (error) {
        if (error.code === "PGRST116") {
          throw new Error("This payout request is no longer valid because the request status changed concurrently.");
        }
        throw new Error(error.message);
      }
      if (!data) throw new Error("Hire request was not updated; status may have changed during payout.");
      return data;
    } else {
      // No on-chain transaction yet; cancel the stale payment and require
      // a successful cancel response before proceeding to create a fresh
      // payment. Any failure must bubble up and abort the payout.
      const identifier = match.id ?? match.identifier;
      const cancelResp = await cancelPayment(identifier);
      if (!cancelResp || !cancelResp.status || cancelResp.status.cancelled !== true) {
        throw new Error(`Failed to cancel stale payment ${identifier}: unexpected response`);
      }
      // If we reach here, cancel succeeded and we continue to create a fresh payment.
    }
  }

  const payment = await createA2UPayment({
    uid: recipient,
    amount: hr.amount,
    memo: `${params.favor === "provider" ? "Release" : "Refund"} for hire request ${hr.id}`,
    metadata: {
      hireRequestId: hr.id,
      kind: params.favor === "provider" ? "escrow_release" : "escrow_refund",
      resolvedBy: params.resolvedBy ?? null,
    },
  });

  // Debug log removed after verification per audit request.

  // Payment created by Pi Platform returned as `payment`.
  // Now sign and submit the Stellar transaction using the app wallet seed,
  // then call Pi's complete endpoint with the real tx hash.
  const seed = requirePayoutSigner();

  // Submit to Stellar (may throw). This moves funds on-chain.
  let txhash: string;
  try {
    txhash = await submitA2UPayment(payment, seed);
  } catch (submitErr) {
    // Signing/submission failed — do not update DB. Surface the error.
    throw new Error(`Failed to submit A2U payment: ${submitErr instanceof Error ? submitErr.message : String(submitErr)}`);
  }

  // Complete the Pi payment using the txhash. If this fails, log loudly
  // and re-throw so the DB is NOT updated while on-chain movement may have occurred.
  const paymentId = payment?.id ?? payment?.identifier;
  try {
    await completePayment(paymentId, txhash);
  } catch (completeErr) {
    // Critical mismatch: funds may have moved but Pi did not acknowledge completion.
    // Log verbosely server-side for manual reconciliation.
    // eslint-disable-next-line no-console
    console.error("[Payout] COMPLETE_PAYMENT_FAILED: paymentId=", paymentId, "txhash=", txhash, "error=", completeErr);
    throw new Error(`Completing Pi payment failed after submit: ${completeErr instanceof Error ? completeErr.message : String(completeErr)}`);
  }

  const txid = txhash;
  const update: Record<string, unknown> =
    params.favor === "provider"
      ? { status: "released", release_txid: txid }
      : { status: "refunded", refund_txid: txid };

  if (params.resolvedBy) {
    update.resolved_by = params.resolvedBy;
    update.resolved_favor = params.favor;
    update.dispute_stage = "resolved";
  }

  const { data, error } = await supabaseAdmin
    .from("hire_requests")
    .update(update)
    .eq("id", params.hireRequestId)
    .eq("status", hr.status)
    .select()
    .single();
  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("This payout request is no longer valid because the request status changed concurrently.");
    }
    throw new Error(error.message);
  }
  if (!data) throw new Error("Hire request was not updated; status may have changed during payout.");
  return data;
}
