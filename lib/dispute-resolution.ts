import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-server";
import { createA2UPayment, completePayment, getIncompleteServerPayments, cancelPayment, getPayment, sendInAppNotifications } from "@/lib/pi-platform";
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

export class PayoutWalletBusyError extends Error {
  status = 409;
  constructor(message?: string) {
    super(message ?? "Payout wallet is busy; retry later.");
    this.name = "PayoutWalletBusyError";
  }
}

export class PayoutWalletLeaseLostError extends Error {
  status = 409;
  constructor(message?: string) {
    super(message ?? "Payout wallet lease ownership was lost; retry later.");
    this.name = "PayoutWalletLeaseLostError";
  }
}

export class PayoutRecoveryFailure extends Error {
  constructor(public original: unknown) {
    super("payout recovery failure — must not roll back lock");
    this.name = "PayoutRecoveryFailure";
  }
}

function requirePayoutSigner(): string {
  const seed = process.env.PI_APP_WALLET_SEED?.trim();
  if (!seed) throw new PayoutNotConfiguredError();
  return seed;
}

async function acquireWalletLease(owner: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("acquire_payout_wallet_lease", {
    p_wallet_id: "app_wallet",
    p_owner: owner,
    p_ttl_seconds: 45,
  });

  if (error) {
    throw new Error(`Failed to acquire payout wallet lease: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return Boolean(row?.acquired === true);
}

async function renewWalletLease(owner: string): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 45_000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("payout_wallet_lease")
    .update({
      lease_acquired_at: now.toISOString(),
      lease_expires_at: expiresAt,
    })
    .eq("wallet_id", "app_wallet")
    .eq("lease_owner", owner)
    .select("wallet_id")
    .maybeSingle();

  if (error) {
    // The lease is still the source of truth; failures here are operationally
    // important and should not be silently ignored by the worker.
    throw new Error(`Failed to renew payout wallet lease: ${error.message}`);
  }

  if (!data) {
    return false;
  }

  return true;
}

async function releaseWalletLease(owner: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin.rpc("release_payout_wallet_lease", {
      p_wallet_id: "app_wallet",
      p_owner: owner,
    });

    if (error) {
      // Preserve the existing payout behavior and never force a stale worker to
      // clear a newer lease. This is best-effort cleanup only.
      // eslint-disable-next-line no-console
      console.warn("[Payout] failed to release wallet lease:", error.message);
    }
  } catch (releaseErr) {
    // eslint-disable-next-line no-console
    console.warn("[Payout] release wallet lease exception:", releaseErr instanceof Error ? releaseErr.message : String(releaseErr));
  }
}

export async function finalizePaymentLock(hireRequestId: string, paymentId: string, txid: string) {
  const { data: hr, error: fetchErr } = await supabaseAdmin
    .from("hire_requests")
    .select("id, status, escrow_request_id, lock_txid")
    .eq("id", hireRequestId)
    .single();

  if (fetchErr || !hr) {
    throw new Error("Hire request not found");
  }
  if (hr.escrow_request_id && hr.escrow_request_id !== paymentId) {
    throw new Error("paymentId does not match the approved payment");
  }
  if (["released", "refunded", "cancelled"].includes(hr.status)) {
    return hr;
  }
  if (hr.status === "locked" && hr.lock_txid === txid) {
    return hr;
  }

  const { data, error } = await supabaseAdmin
    .from("hire_requests")
    .update({ status: "locked", lock_txid: txid, payout_status: "confirmed" })
    .eq("id", hireRequestId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function getStoredPayoutPaymentId(hireRequestId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("hire_requests")
    .select("reference_notes")
    .eq("id", hireRequestId)
    .single();

  if (error || !data || typeof data.reference_notes !== "string") {
    return null;
  }

  const raw = data.reference_notes.trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const value = parsed.payoutPaymentId ?? parsed.payout_payment_id ?? parsed.paymentId ?? parsed.id;
      return typeof value === "string" && value.trim() ? value.trim() : null;
    }
  } catch {
    // Backward-compatible fallback for any older raw-string entries.
    return raw || null;
  }

  return null;
}

async function findCompletedPayoutPaymentMatch(hireRequestId: string, favor: "provider" | "buyer") {
  const paymentId = await getStoredPayoutPaymentId(hireRequestId);
  if (!paymentId) {
    return null;
  }

  try {
    const payment = await getPayment(paymentId);
    const metadata = payment?.metadata ?? {};
    const kind = metadata.kind;
    const sameKind = (favor === "provider" && kind === "escrow_release") || (favor === "buyer" && kind === "escrow_refund");
    if (!sameKind || metadata.hireRequestId !== hireRequestId) {
      return null;
    }

    const statusValue = payment?.status && typeof payment.status === "object" ? payment.status.status : payment?.status;
    const normalized = String(statusValue ?? "").toLowerCase();
    const txVerified = payment?.status?.transaction_verified === true || payment?.status?.transaction_verified === "true";
    const isCompleted = txVerified || normalized === "complete" || normalized === "completed";
    const isCancelledOrFailed = normalized === "cancelled" || normalized === "canceled" || normalized === "failed" || normalized === "failed_to_complete";

    if (isCompleted) {
      return payment;
    }

    if (isCancelledOrFailed) {
      return { status: "cancelled", id: paymentId, identifier: paymentId, metadata, transaction: payment?.transaction ?? null };
    }

    return { status: "ambiguous", id: paymentId, identifier: paymentId, metadata, transaction: payment?.transaction ?? null };
  } catch (err) {
    await supabaseAdmin
      .from("hire_requests")
      .update({ payout_status: "manual_review" })
      .eq("id", hireRequestId);

    throw new Error(`Failed to inspect persisted payout payment ${paymentId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function reconcileStalePayoutLock(hireRequestId: string, favor: "provider" | "buyer") {
  const { data: hr, error: fetchErr } = await supabaseAdmin
    .from("hire_requests")
    .select("id, buyer_uid, provider_uid, amount, status, payout_locked_at, payout_status, release_txid, refund_txid")
    .eq("id", hireRequestId)
    .single();

  if (fetchErr || !hr) {
    throw new Error("Hire request not found");
  }

  if (hr.release_txid || hr.refund_txid) {
    return { action: "terminal", request: hr as any };
  }

  if (hr.payout_locked_at) {
    const lockAgeMs = Date.now() - new Date(hr.payout_locked_at).getTime();
    if (lockAgeMs < 30_000) {
      return { action: "active", request: hr as any };
    }
  }

  try {
    const incomplete = await getIncompleteServerPayments();
    const matches = (incomplete || []).filter((p: any) => {
      const kind = p?.metadata?.kind;
      const sameId = p?.metadata?.hireRequestId === hireRequestId;
      return sameId && (kind === "escrow_release" || kind === "escrow_refund");
    });

    if (matches.length > 0) {
      const match = matches.find((p: any) => {
        const kind = p?.metadata?.kind;
        return (favor === "provider" && kind === "escrow_release") || (favor === "buyer" && kind === "escrow_refund");
      }) ?? matches[0];

      const paymentId = match.identifier ?? match.id;
      const txid = match.transaction?.txid ?? match.transaction?.hash ?? match.txid ?? null;
      const verified = match?.status?.transaction_verified === true || !!txid || match?.status === "complete";

      if (verified) {
        if (!txid) {
          throw new Error("Found verified payout payment without txid");
        }
        await completePayment(paymentId, txid);
        const update = favor === "provider"
          ? { status: "released", release_txid: txid, payout_status: "confirmed" }
          : { status: "refunded", refund_txid: txid, payout_status: "confirmed" };
        const { data, error } = await supabaseAdmin
          .from("hire_requests")
          .update(update)
          .eq("id", hireRequestId)
          .eq("payout_locked_at", hr.payout_locked_at)
          .select()
          .single();
        if (error) {
          await supabaseAdmin.from("hire_requests").update({ payout_status: "manual_review" }).eq("id", hireRequestId);
          throw new Error(error.message);
        }
        const resolvedReq = data ?? hr;
        try {
          const userUid = favor === "provider" ? resolvedReq.provider_uid : resolvedReq.buyer_uid;
          const title = favor === "provider" ? "You received a payout" : "Refund issued";
          const body = favor === "provider" ? `Funds released for hire request ${hireRequestId}` : `A refund was issued for hire request ${hireRequestId}`;
          await sendInAppNotifications([{ title, body, user_uid: userUid, subroute: `/hire-requests/${hireRequestId}` }]);
        } catch (notifyErr) {
          // Non-blocking: do not fail payout if notifications fail.
          // eslint-disable-next-line no-console
          console.error("[Notifications] failed to send payout notification:", notifyErr instanceof Error ? notifyErr.message : String(notifyErr));
        }
        return { action: "resolved", request: resolvedReq };
      }

      await cancelPayment(paymentId);
      await supabaseAdmin
        .from("hire_requests")
        .update({ payout_locked_at: null, payout_status: null })
        .eq("id", hireRequestId)
        .eq("payout_locked_at", hr.payout_locked_at ?? null);
      return { action: "recovered_cancelled", request: hr };
    }

    const completedMatch = await findCompletedPayoutPaymentMatch(hireRequestId, favor);
    if (completedMatch) {
      const paymentId = completedMatch.identifier ?? completedMatch.id;
      const txid = completedMatch.transaction?.txid ?? completedMatch.transaction?.hash ?? completedMatch.txid ?? null;

      if (completedMatch.status === "ambiguous") {
        await supabaseAdmin
          .from("hire_requests")
          .update({ payout_status: "manual_review" })
          .eq("id", hireRequestId);
        return {
          action: "manual_review",
          request: hr,
          error: `Persisted payout payment ${paymentId} exists but is not in a terminal Pi state yet.`,
        };
      }

      if (completedMatch.status === "cancelled") {
        await supabaseAdmin
          .from("hire_requests")
          .update({ payout_locked_at: null, payout_status: null })
          .eq("id", hireRequestId)
          .eq("payout_locked_at", hr.payout_locked_at ?? null);
        return { action: "cleared", request: hr };
      }

      if (!txid) {
        throw new Error("Found completed payout payment without txid");
      }

      await completePayment(paymentId, txid);
      const update = favor === "provider"
        ? { status: "released", release_txid: txid, payout_status: "confirmed" }
        : { status: "refunded", refund_txid: txid, payout_status: "confirmed" };
      const { data, error } = await supabaseAdmin
        .from("hire_requests")
        .update(update)
        .eq("id", hireRequestId)
        .eq("payout_locked_at", hr.payout_locked_at)
        .select()
        .single();
      if (error) {
        await supabaseAdmin.from("hire_requests").update({ payout_status: "manual_review" }).eq("id", hireRequestId);
        throw new Error(error.message);
      }
      return { action: "resolved", request: data ?? hr };
    }

    await supabaseAdmin
      .from("hire_requests")
      .update({ payout_locked_at: null, payout_status: null })
      .eq("id", hireRequestId)
      .eq("payout_locked_at", hr.payout_locked_at ?? null);

    return { action: "cleared", request: hr };
  } catch (reconcileErr) {
    await supabaseAdmin
      .from("hire_requests")
      .update({ payout_status: "manual_review" })
      .eq("id", hireRequestId);
    return {
      action: "manual_review",
      request: hr,
      error: reconcileErr instanceof Error ? reconcileErr.message : "Payout reconciliation failed",
    };
  }
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
  let hr: any;
  const { data: initialHr, error: lockErr } = await supabaseAdmin
    .from("hire_requests")
    .update({ payout_locked_at: now, payout_status: "processing" })
    .eq("id", params.hireRequestId)
    .is("payout_locked_at", null)
    .is("release_txid", null)
    .is("refund_txid", null)
    .select("id, buyer_uid, provider_uid, amount, status, release_txid, refund_txid, payout_locked_at")
    .single();

  hr = initialHr;

  if (lockErr || !hr) {
    const current = await supabaseAdmin
      .from("hire_requests")
      .select("id, buyer_uid, provider_uid, amount, status, payout_locked_at, payout_status, release_txid, refund_txid")
      .eq("id", params.hireRequestId)
      .single();

    if (current.error || !current.data) {
      throw new Error("Failed to acquire payout lock: another process holds it or payout already recorded.");
    }

    if (current.data.release_txid || current.data.refund_txid) {
      return current.data;
    }

    const lockAgeMs = current.data.payout_locked_at ? Date.now() - new Date(current.data.payout_locked_at).getTime() : Number.POSITIVE_INFINITY;
    if (Number.isFinite(lockAgeMs) && lockAgeMs < 30_000) {
      throw new Error("Failed to acquire payout lock: another process is actively processing this payout.");
    }

    const reconciliation = await reconcileStalePayoutLock(params.hireRequestId, params.favor);
    if (reconciliation.action === "terminal" || reconciliation.action === "resolved") {
      return reconciliation.request;
    }
    if (reconciliation.action === "active") {
      throw new Error("Failed to acquire payout lock: another process is actively processing this payout.");
    }
    if (reconciliation.action === "manual_review") {
      throw new Error("Payout reconciliation requires manual review; lock remains in place.");
    }

    const retry = await supabaseAdmin
      .from("hire_requests")
      .update({ payout_locked_at: now, payout_status: "processing" })
      .eq("id", params.hireRequestId)
      .is("payout_locked_at", null)
      .is("release_txid", null)
      .is("refund_txid", null)
      .select("id, buyer_uid, provider_uid, amount, status, release_txid, refund_txid, payout_locked_at")
      .single();

    if (retry.error || !retry.data) {
      throw new Error("Failed to acquire payout lock after reconciliation. Please retry once the lock is released or reconciled.");
    }
    hr = retry.data;
  }

  let recipient: string;
  let gross: number;
  let feePercent: number;
  let platformFee: number;
  let workerPayout: number;
  const walletLeaseOwner = randomUUID();
  let walletLeaseAcquired = false;

  try {
    requirePayoutSigner();
    walletLeaseAcquired = await acquireWalletLease(walletLeaseOwner);
    if (!walletLeaseAcquired) {
      throw new PayoutWalletBusyError();
    }

    recipient = params.favor === "provider" ? hr.provider_uid : hr.buyer_uid;

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
        try {
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
          try {
            const userUid = params.favor === "provider" ? data.provider_uid : data.buyer_uid;
            const title = params.favor === "provider" ? "You received a payout" : "Refund issued";
            const body = params.favor === "provider" ? `Funds released for hire request ${params.hireRequestId}` : `A refund was issued for hire request ${params.hireRequestId}`;
            await sendInAppNotifications([{ title, body, user_uid: userUid, subroute: `/hire-requests/${params.hireRequestId}` }]);
          } catch (notifyErr) {
            // Non-blocking: log and continue
            // eslint-disable-next-line no-console
            console.error("[Notifications] failed to send payout notification:", notifyErr instanceof Error ? notifyErr.message : String(notifyErr));
          }
          return data;
        } catch (recoveryErr) {
          try {
            await supabaseAdmin
              .from("hire_requests")
              .update({ payout_status: "manual_review" })
              .eq("id", hr.id);
          } catch (markErr) {
            // eslint-disable-next-line no-console
            console.error("[Payout] failed to mark manual_review after recovery failure:", markErr);
          }
          throw new PayoutRecoveryFailure(recoveryErr);
        }
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
    gross = Number(hr.amount);
    feePercent = getPlatformFeePercent();
    platformFee = formatPi(gross * feePercent);
    workerPayout = formatPi(gross - platformFee);
  } catch (preflightErr) {
    if (preflightErr instanceof PayoutRecoveryFailure) {
      throw preflightErr.original;
    }
    await supabaseAdmin
      .from("hire_requests")
      .update({ payout_locked_at: null, payout_status: null })
      .eq("id", hr.id)
      .eq("payout_locked_at", now);
    throw preflightErr;
  }

  let payment: any;
  let txhash: string | null = null;

  try {
    const renewed = await renewWalletLease(walletLeaseOwner);
    if (!renewed) {
      throw new PayoutWalletLeaseLostError();
    }
    payment = await createA2UPayment({
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

    const persistedPaymentId = payment?.identifier ?? payment?.id ?? null;
    if (persistedPaymentId) {
      const payload = JSON.stringify({ payoutPaymentId: persistedPaymentId });
      await supabaseAdmin
        .from("hire_requests")
        .update({ reference_notes: payload })
        .eq("id", hr.id)
        .eq("payout_locked_at", now);
    }

    // Debug log removed after verification per audit request.

    // Payment created by Pi Platform returned as `payment`.
    // Now sign and submit the Stellar transaction using the app wallet seed,
    // then call Pi's complete endpoint with the real tx hash.
    const seed = requirePayoutSigner();

    const renewedBeforeSubmit = await renewWalletLease(walletLeaseOwner);
    if (!renewedBeforeSubmit) {
      throw new PayoutWalletLeaseLostError();
    }

    // Submit to Stellar (may throw). This moves funds on-chain.
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
      const { data: persisted, error: persistWriteErr } = await supabaseAdmin
        .from("hire_requests")
        .update({ ...txField, payout_status: "processing" })
        .eq("id", hr.id)
        .eq("payout_locked_at", now)
        .select("id")
        .single();

      if (persistWriteErr || !persisted) {
        await supabaseAdmin.from("hire_requests").update({ payout_status: "manual_review" }).eq("id", hr.id);
        throw new Error(`Failed to persist txid for hire_request ${hr.id}: lock changed or row no longer matches this payout attempt.`);
      }
    } catch (persistErr) {
      // If persisting the txid fails, mark for manual review and abort.
      await supabaseAdmin.from("hire_requests").update({ payout_status: "manual_review" }).eq("id", hr.id);
      throw new Error(`Failed to persist txid for hire_request ${hr.id}: ${persistErr instanceof Error ? persistErr.message : String(persistErr)}`);
    }

    // Complete the Pi payment using the txhash. If this fails, mark manual_review
    // and do NOT clear the lock — an admin must reconcile.
    const paymentId = payment?.id ?? payment?.identifier;
    try {
      const renewedBeforeCompletion = await renewWalletLease(walletLeaseOwner);
      if (!renewedBeforeCompletion) {
        throw new PayoutWalletLeaseLostError();
      }
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
    try {
      const userUid = params.favor === "provider" ? data.provider_uid : data.buyer_uid;
      const title = params.favor === "provider" ? "You received a payout" : "Refund issued";
      const body = params.favor === "provider" ? `Funds released for hire request ${params.hireRequestId}` : `A refund was issued for hire request ${params.hireRequestId}`;
      await sendInAppNotifications([{ title, body, user_uid: userUid, subroute: `/hire-requests/${params.hireRequestId}` }]);
    } catch (notifyErr) {
      // Non-blocking: log and continue
      // eslint-disable-next-line no-console
      console.error("[Notifications] failed to send payout notification:", notifyErr instanceof Error ? notifyErr.message : String(notifyErr));
    }
    return data;
  } finally {
    if (walletLeaseAcquired && walletLeaseOwner) {
      await releaseWalletLease(walletLeaseOwner);
    }
  }
}
