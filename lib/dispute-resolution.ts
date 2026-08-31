import { supabaseAdmin } from "@/lib/supabase-server";
import { createA2UPayment, completePayment, getIncompleteServerPayments, cancelPayment } from "@/lib/pi-platform";
import { submitA2UPayment } from "@/lib/pi-a2u";
import { getPlatformFeePercent, formatPi } from "@/lib/fee-config";

export class PayoutNotConfiguredError extends Error {
  status = 503;
  constructor() {
    super("Payouts aren't live yet: PI_APP_WALLET_SEED is not configured.");
    this.name = "PayoutNotConfiguredError";
  }
}

export class PayoutBlockedByUnreconciledPaymentError extends Error {
  status = 409;
  constructor(message?: string) {
    super(message ?? "Payout blocked by an unreconciled payment belonging to another hire request.");
    this.name = "PayoutBlockedByUnreconciledPaymentError";
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
  // Acquire an atomic payout lock as the very first write. This update will
  // only succeed if `payout_locked_at` is NULL and there are no existing
  // release/refund txids set (prevents double payouts).
  const now = new Date().toISOString();
  const { data: hr, error: lockErr } = await supabaseAdmin
    .from("hire_requests")
    .update({ payout_locked_at: now, payout_status: "processing" })
    .eq("id", params.hireRequestId)
    .is("payout_locked_at", null)
    .is("release_txid", null)
    .is("refund_txid", null)
    .select("id, buyer_uid, provider_uid, amount, status, release_txid, refund_txid")
    .single();

  if (lockErr || !hr) {
    throw new Error("Failed to acquire payout lock: another process holds it or payout already recorded.");
  }

  requirePayoutSigner();

  const recipient = params.favor === "provider" ? hr.provider_uid : hr.buyer_uid;

  // NOTE: Per safety requirements, failures here must fail fast — do NOT
  // fall through to creating a new payment when listing or cancelling fails.
  const incomplete = await getIncompleteServerPayments();

  // Only consider payments that belong to our app (have metadata.hireRequestId)
  // and are of the expected kinds for escrow payouts.
  const appPayments = (incomplete || []).filter((p: any) => {
    const hasId = !!p?.metadata?.hireRequestId;
    const kind = p?.metadata?.kind;
    const allowedKind = kind === "escrow_release" || kind === "escrow_refund";
    return hasId && allowedKind;
  });

  // Find payment matching the current hire request, if any
  const match = appPayments.find((p: any) => p?.metadata?.hireRequestId === hr.id);

  // If there's a payment for this hire request, handle it first
  if (match) {
    const identifier = match.identifier; // use identifier exclusively
    const txVerified = Boolean(match?.status?.transaction_verified === true);
    // Validate the referenced hire request exists and is in an allowed in-flight state
    const { data: refHr, error: refErr } = await supabaseAdmin
      .from("hire_requests")
      .select("id, status")
      .eq("id", match?.metadata?.hireRequestId)
      .single();
    if (refErr || !refHr) {
      throw new Error(`Referenced hire_request ${match?.metadata?.hireRequestId} not found; refusing to act on payment ${identifier}`);
    }
    const allowedStatuses = ["delivered", "disputed", "locked"];
    if (!allowedStatuses.includes(String(refHr.status))) {
      throw new Error(`Referenced hire_request ${refHr.id} has status '${refHr.status}', not eligible for payout recovery`);
    }
    if (txVerified) {
      const txid = match?.transaction?.txid ?? match?.transaction?.hash ?? null;
      if (!txid) {
        throw new Error("Found transaction-verified payment but missing txid for completion");
      }
      await completePayment(identifier, txid);

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
        .update({ ...update, payout_status: "confirmed" })
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

    // txVerified === false: cancel the stale payment and require a successful
    // cancel before proceeding to create a fresh payment.
    const cancelResp = await cancelPayment(identifier);
    if (!cancelResp || !cancelResp.status || cancelResp.status.cancelled !== true) {
      throw new Error(`Failed to cancel stale payment ${identifier}: unexpected response`);
    }
    // Cancelled successfully; continue to create fresh payment
  } else if (appPayments.length > 0) {
    // There are payments for OTHER hire requests — treat them as blockers.
    // Validate each blocker against the referenced hire_request before acting.
    const blockers = appPayments.filter((p: any) => p?.metadata?.hireRequestId !== hr.id);
    for (const b of blockers) {
      const identifier = b.identifier;
      const refId = b?.metadata?.hireRequestId;
      const { data: refHr, error: refErr } = await supabaseAdmin
        .from("hire_requests")
        .select("id, status")
        .eq("id", refId)
        .single();
      if (refErr || !refHr) {
        // Skip acting on payments that reference missing hire records
        // eslint-disable-next-line no-console
        console.warn("[Payout] skipping payment referencing missing hire_request:", identifier, refId);
        continue;
      }
      const allowedStatuses = ["delivered", "disputed", "locked"];
      if (!allowedStatuses.includes(String(refHr.status))) {
        // Skip payments whose referenced hire_request is not in an allowed state
        // eslint-disable-next-line no-console
        console.warn("[Payout] skipping payment referencing hire_request with ineligible status:", identifier, refId, refHr.status);
        continue;
      }
      const txVerified = Boolean(b?.status?.transaction_verified === true);
      if (txVerified) {
        // Blocker has funds moved on-chain for a different hire request — must
        // not proceed. Return a clear error for reconciliation.
        // eslint-disable-next-line no-console
        console.error("[Payout] blocked by unreconciled payment:", JSON.stringify({ identifier, hireRequestId: b.metadata?.hireRequestId }));
        throw new PayoutBlockedByUnreconciledPaymentError(`Blocked by unreconciled payment ${identifier} for hire ${b.metadata?.hireRequestId}`);
      }
      // txVerified === false: cancel the blocker and require success before proceeding
      const cancelResp = await cancelPayment(identifier);
      if (!cancelResp || !cancelResp.status || cancelResp.status.cancelled !== true) {
        throw new Error(`Failed to cancel blocking payment ${identifier}: unexpected response`);
      }
      // cancelled successfully; continue to next blocker
    }
    // All applicable blockers cancelled successfully; continue to create fresh payment
  }

  // Compute platform fee and worker payout. Platform fee is retained by the
  // platform/escrow account; blockchain gas is covered separately by the
  // platform wallet (see lib/pi-a2u.ts fee setting).
  const gross = Number(hr.amount);
  const feePercent = getPlatformFeePercent();
  const platformFee = formatPi(gross * feePercent);
  const workerPayout = formatPi(gross - platformFee);

  const payment = await createA2UPayment({
    uid: recipient,
    // Send only the worker payout amount to the recipient.
    amount: workerPayout,
    memo: `${params.favor === "provider" ? "Release" : "Refund"} for hire request ${hr.id}`,
    metadata: {
      hireRequestId: hr.id,
      kind: params.favor === "provider" ? "escrow_release" : "escrow_refund",
      resolvedBy: params.resolvedBy ?? null,
      // Persist fee accounting in the payment metadata for auditability.
      grossAmount: gross,
      platformFee: platformFee,
      platformFeePercent: feePercent,
      workerPayout: workerPayout,
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

  // Immediately persist the txid so manual review can reconcile on-chain state
  // even if the completion step fails.
  try {
    const txField = params.favor === "provider" ? { release_txid: txhash } : { refund_txid: txhash };
    await supabaseAdmin.from("hire_requests").update({ ...txField, payout_status: "processing" }).eq("id", hr.id);
  } catch (persistErr) {
    // If persisting the txid fails, mark for manual review and abort.
    await supabaseAdmin.from("hire_requests").update({ payout_status: "manual_review" }).eq("id", hr.id);
    throw new Error(`Failed to persist txid for hire_request ${hr.id}: ${persistErr instanceof Error ? persistErr.message : String(persistErr)}`);
  }

  // Complete the Pi payment using the txhash. If this fails, mark manual_review
  // and do NOT clear the lock — an admin must reconcile.
  const paymentId = payment?.id ?? payment?.identifier;
  try {
    await completePayment(paymentId, txhash);
  } catch (completeErr) {
    // eslint-disable-next-line no-console
    console.error("[Payout] COMPLETE_PAYMENT_FAILED: paymentId=", paymentId, "txhash=", txhash, "error=", completeErr);
    await supabaseAdmin.from("hire_requests").update({ payout_status: "manual_review" }).eq("id", hr.id);
    throw new Error(`Completing Pi payment failed after submit: ${completeErr instanceof Error ? completeErr.message : String(completeErr)}`);
  }

  // On success, finalize the hire_request status and accounting. Keep the
  // payout_locked_at in place; clearing must be a manual admin action.
  const txid = txhash;
  const finalUpdate: Record<string, unknown> =
    params.favor === "provider"
      ? { status: "released", release_txid: txid, platform_fee: platformFee, worker_payout: workerPayout }
      : { status: "refunded", refund_txid: txid, platform_fee: platformFee, worker_payout: workerPayout };

  if (params.resolvedBy) {
    finalUpdate.resolved_by = params.resolvedBy;
    finalUpdate.resolved_favor = params.favor;
    finalUpdate.dispute_stage = "resolved";
  }

  const { data, error } = await supabaseAdmin
    .from("hire_requests")
    .update({ ...finalUpdate, payout_status: "confirmed" })
    .eq("id", params.hireRequestId)
    .eq("status", hr.status)
    .select()
    .single();
  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("This payout request is no longer valid because the request status changed concurrently.");
    }
    // If DB write fails here, leave the record in `manual_review` state for admins.
    await supabaseAdmin.from("hire_requests").update({ payout_status: "manual_review" }).eq("id", hr.id);
    throw new Error(error.message);
  }
  if (!data) {
    await supabaseAdmin.from("hire_requests").update({ payout_status: "manual_review" }).eq("id", hr.id);
    throw new Error("Hire request was not updated; status may have changed during payout.");
  }
  return data;
}
