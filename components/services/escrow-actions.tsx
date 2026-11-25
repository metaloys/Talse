"use client";

import { useEffect, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { useServices } from "@/contexts/services-context";
import { backendApi } from "@/lib/backend-api";
import { getOrCreateRecovery, waitForAllRecoveries } from "@/lib/recovery-guard";
import { getFrontendPlatformFeePercent, calcPlatformFee, BLOCKCHAIN_GAS_LABEL } from "@/lib/frontend-fee-config";
import { formatPi, type HireRequest } from "@/lib/services/data";
import { track } from "@/lib/analytics";
import { Button, Card } from "./ui";
import { IconCheck, IconShield, IconWallet } from "./icons";

const STUCK_PAYMENT_AGE_MS = 60_000;

async function payIntoEscrow(req: HireRequest, accessToken: string): Promise<void> {
  if (typeof window === "undefined" || !window.Pi?.createPayment) {
    throw new Error("Pi payments are not available in this environment");
  }

    try {
      await waitForAllRecoveries();
    } catch (e) {
      // If helper fails, fall back silently.
    }

  return new Promise((resolve, reject) => {
    window.Pi.createPayment(
      {
        amount: req.servicePrice,
        memo: `Escrow lock: ${req.serviceTitle}`.slice(0, 28),
        metadata: { hireRequestId: req.id, kind: "escrow_lock" },
      },
      {
        onReadyForServerApproval: async (paymentId: string) => {
          try {
            await backendApi.payments.approve(paymentId, req.id, accessToken);
          } catch (err) {
            reject(err);
          }
        },
        onIncompletePaymentFound: async (payment: any) => {
          try {
            await getOrCreateRecovery(payment.id, () => backendApi.payments.recover(payment.id, accessToken));
          } catch (err) {
            console.error("Payment recovery failed:", err);
          }
        },
        onReadyForServerCompletion: async (paymentId: string, txid: string) => {
          try {
            await backendApi.payments.complete(paymentId, txid, req.id, accessToken);
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        onCancel: () => reject(new Error("Payment was cancelled")),
        onError: (error: unknown) => reject(error instanceof Error ? error : new Error(String(error))),
      }
    );
  });
}

export function EscrowActions({ req, onReleased }: { req: HireRequest; onReleased?: (req: HireRequest) => void }) {
  const { accessToken, recoveryInProgress } = usePiAuth();
  const { refreshRequests, setRequestStatus, fileDispute, pushToast } = useServices();
  const [busy, setBusy] = useState(false);
  const [showRecoveryCard, setShowRecoveryCard] = useState(false);
  const [stuckPayment, setStuckPayment] = useState<any | null>(null);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeDetails, setDisputeDetails] = useState("");
  const [disputeEvidence, setDisputeEvidence] = useState("");
  // Money moves are never one click: paying into escrow and releasing funds
  // both expand an explicit confirmation receipt first.
  const [confirmPay, setConfirmPay] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);

  const inspectStuckPayment = async (silent = false) => {
    if (!accessToken) return null;
    try {
      const { incomplete } = await backendApi.payments.listIncomplete(accessToken);
      const next = Array.isArray(incomplete) && incomplete.length > 0 ? incomplete[0] : null;
      setStuckPayment(next);
      setShowRecoveryCard(Boolean(next));
      if (!next && !silent) {
        pushToast("No stuck payments found", "info");
      }
      return next;
    } catch (err) {
      console.error("Check stuck payment failed", err);
      if (!silent) pushToast("Failed checking for stuck payment", "warning");
      setStuckPayment(null);
      setShowRecoveryCard(false);
      return null;
    }
  };

  const recoverStuckPayment = async (paymentId: string) => {
    if (!accessToken) return;
    try {
      setBusy(true);
      if (!paymentId) throw new Error("no payment id");
      await getOrCreateRecovery(paymentId, () => backendApi.payments.recover(paymentId, accessToken));
      setShowRecoveryCard(false);
      setStuckPayment(null);
      pushToast("Recovered stuck payment", "success");
      await refreshRequests();
    } catch (err) {
      console.error("Recover stuck payment failed", err);
      pushToast("Failed to recover stuck payment", "warning");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    if (req.direction !== "outgoing" || req.status !== "accepted") return;
    const ageMs = Date.now() - (req.createdAt ?? 0);
    if (ageMs < STUCK_PAYMENT_AGE_MS) return;
    void inspectStuckPayment(true);
  }, [accessToken, req.createdAt, req.direction, req.id, req.status]);

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error("[Escrow] Action failed:", err);
      const raw = err instanceof Error ? err.message : "Action failed";
      const message = /payouts? aren.t live yet|PI_APP_WALLET_SEED|wallet seed/i.test(raw)
        ? "Payouts aren't live yet — the app wallet seed is not configured."
        : raw;
      pushToast(message, "warning");
    } finally {
      setBusy(false);
    }
  };

  if (!accessToken) return null;

  if (req.direction === "outgoing" && req.status === "accepted") {
    return (
      <div className="flex w-full flex-col gap-2">
        {showRecoveryCard && stuckPayment ? (
          <div className="rounded-md border border-warning bg-warning-soft p-3 text-left">
            <p className="text-xs font-medium text-warning-foreground">A previous payment attempt for this request did not finish. Recover it?</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => recoverStuckPayment(stuckPayment.id)} disabled={busy}>
                {busy ? "Recovering…" : "Recover"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowRecoveryCard(false)} disabled={busy}>
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}

        {(() => {
          const pct = getFrontendPlatformFeePercent();
          const fee = calcPlatformFee(req.servicePrice, pct);
          const receive = Math.round((req.servicePrice - fee) * 100) / 100;
          return (
            <Card className="w-full p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">Lock in escrow</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  <IconShield size={11} />
                  Escrow
                </span>
              </div>
              <div className="mt-2 space-y-1 text-[11px]">
                <div className="flex items-center justify-between text-foreground">
                  <span>Held until you approve delivery</span>
                  <span className="font-semibold text-primary ps-nums">{formatPi(req.servicePrice)}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Platform fee ({Math.round(pct * 100)}%)</span>
                  <span className="ps-nums">-{formatPi(fee)} from payout</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Provider receives on release</span>
                  <span className="font-medium text-foreground ps-nums">{formatPi(receive)}</span>
                </div>
                <p className="border-t border-border pt-1.5 text-[10px] text-muted-foreground">{BLOCKCHAIN_GAS_LABEL}</p>
              </div>
            </Card>
          );
        })()}
        {confirmPay ? (
          <div className="w-full space-y-2 rounded-xl border border-primary/30 bg-primary-soft/50 p-3 text-left">
            <div className="flex items-start gap-2">
              <IconWallet size={16} className="mt-0.5 shrink-0 text-primary" />
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Lock {formatPi(req.servicePrice)} in escrow?
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  Your Pi stays locked until you confirm delivery. You can dispute before releasing.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                disabled={busy}
                onClick={() =>
                  withBusy(async () => {
                    if (recoveryInProgress) {
                      pushToast("Resolving a previous payment, try again in a moment", "warning");
                      return;
                    }
                    setConfirmPay(false);
                    await payIntoEscrow(req, accessToken);
                    track("payment_escrowed", {
                      request_id: req.id,
                      amount: req.servicePrice,
                      service_id: req.serviceId,
                    });
                    await refreshRequests();
                    pushToast("Payment locked in escrow", "success");
                  })
                }
              >
                {busy ? "Processing…" : `Confirm & pay ${formatPi(req.servicePrice)}`}
              </Button>
              <Button variant="outline" size="sm" className="flex-1" disabled={busy} onClick={() => setConfirmPay(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            className="w-full"
            disabled={busy}
            onClick={() => setConfirmPay(true)}
          >
            {busy ? "Processing…" : `Pay ${formatPi(req.servicePrice)} to start`}
          </Button>
        )}

        <button
          type="button"
          className="self-start text-xs text-muted-foreground underline"
          disabled={busy}
          onClick={async () => {
            await inspectStuckPayment(false);
          }}
        >
          Check for stuck payment
        </button>
      </div>
    );
  }

  if (req.direction === "incoming" && req.status === "locked") {
    return (
      <Button
        size="sm"
        className="w-full"
        disabled={busy}
        onClick={() => withBusy(async () => {
          await setRequestStatus(req.id, "delivered");
          track("request_delivered", { request_id: req.id, service_id: req.serviceId });
        })}
      >
        {busy ? "Updating…" : "Mark as delivered"}
      </Button>
    );
  }

  if (req.direction === "outgoing" && req.status === "delivered") {
    return (
      <div className="flex flex-col gap-2">
        {confirmRelease ? (
          <div className="w-full space-y-2 rounded-xl border border-success/40 bg-success-soft/60 p-3 text-left">
            <div className="flex items-start gap-2">
              <IconCheck size={16} className="mt-0.5 shrink-0 text-success" />
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Release {formatPi(req.servicePrice)} to the provider?
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  This moves the escrowed Pi out of escrow for good. Only do this once you&apos;ve received the work and
                  are happy with it.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="success"
                size="sm"
                className="flex-1"
                disabled={busy}
                onClick={() =>
                  withBusy(async () => {
                    setConfirmRelease(false);
                    await backendApi.hireRequests.release(req.id, accessToken);
                    track("payment_released", {
                      request_id: req.id,
                      amount: req.servicePrice,
                      service_id: req.serviceId,
                    });
                    await refreshRequests();
                    pushToast("Funds released to provider", "success");
                    if (onReleased) onReleased(req);
                  })
                }
              >
                {busy ? "Releasing…" : "Yes, release payment"}
              </Button>
              <Button variant="outline" size="sm" className="flex-1" disabled={busy} onClick={() => setConfirmRelease(false)}>
                Not yet
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="success"
            size="sm"
            className="w-full"
            disabled={busy}
            onClick={() => setConfirmRelease(true)}
          >
            {busy ? "Releasing…" : "Confirm & release payment"}
          </Button>
        )}
        {showDisputeForm ? (
          <div className="flex w-full flex-col gap-2 rounded-xl border border-border bg-secondary/30 p-3">
            <div className="text-xs font-semibold text-foreground">Submit dispute</div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              An admin reviews the evidence from both sides and releases the escrow to one party. The funds stay locked
              until then.
            </p>
            <input
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              className="rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              placeholder="Reason"
            />
            <textarea
              value={disputeDetails}
              onChange={(e) => setDisputeDetails(e.target.value)}
              className="min-h-[80px] rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              placeholder="Details"
            />
            <input
              value={disputeEvidence}
              onChange={(e) => setDisputeEvidence(e.target.value)}
              className="rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              placeholder="Evidence (comma-separated)"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                disabled={busy || !disputeReason.trim() || !disputeDetails.trim()}
                onClick={() =>
                  withBusy(async () => {
                    await fileDispute(req.id, {
                      reason: disputeReason.trim(),
                      details: disputeDetails.trim(),
                      evidence: disputeEvidence
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    });
                    setShowDisputeForm(false);
                    setDisputeReason("");
                    setDisputeDetails("");
                    setDisputeEvidence("");
                    await refreshRequests();
                    pushToast("Dispute submitted", "success");
                  })
                }
              >
                {busy ? "Submitting…" : "Submit dispute"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={busy}
                onClick={() => {
                  setShowDisputeForm(false);
                  setDisputeReason("");
                  setDisputeDetails("");
                  setDisputeEvidence("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={busy}
            onClick={() => setShowDisputeForm(true)}
          >
            Dispute
          </Button>
        )}
      </div>
    );
  }

  if (req.status === "disputed") {
    return (
      <div className="rounded-xl border border-destructive/25 bg-destructive-soft/70 p-3">
        <p className="text-xs font-bold text-destructive">Disputed — under review</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          An admin is reviewing the evidence from both sides. The escrow stays locked until a decision is made; the
          outcome will appear here and in Messages.
        </p>
        {req.disputeReason && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">Reason:</span> {req.disputeReason}
          </p>
        )}
      </div>
    );
  }

  return null;
}
