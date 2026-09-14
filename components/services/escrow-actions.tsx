"use client";

import { useEffect, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { useServices } from "@/contexts/services-context";
import { backendApi } from "@/lib/backend-api";
import { getFrontendPlatformFeePercent, calcPlatformFee, BLOCKCHAIN_GAS_LABEL } from "@/lib/frontend-fee-config";
import { formatPi, type HireRequest } from "@/lib/services/data";
import { Button } from "./ui";

const STUCK_PAYMENT_AGE_MS = 60_000;

async function payIntoEscrow(req: HireRequest, accessToken: string): Promise<void> {
  if (typeof window === "undefined" || !window.Pi?.createPayment) {
    throw new Error("Pi payments are not available in this environment");
  }

  const pendingRecovery = (window as any).__pi_payment_recovery_in_flight as Promise<unknown> | undefined;
  if (pendingRecovery) {
    try {
      await pendingRecovery;
    } catch {
      // Recovery attempts are best-effort; keep the retry from racing a stale payment.
    }
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
            if (!(window as any).__pi_payment_recovery_in_flight) {
              (window as any).__pi_payment_recovery_in_flight = backendApi.payments.recover(payment.id, accessToken).finally(() => {
                delete (window as any).__pi_payment_recovery_in_flight;
              });
            }
            await (window as any).__pi_payment_recovery_in_flight;
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
      (window as any).__pi_payment_recovery_in_flight = backendApi.payments.recover(paymentId, accessToken).finally(() => {
        delete (window as any).__pi_payment_recovery_in_flight;
      });
      await (window as any).__pi_payment_recovery_in_flight;
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

        <div className="text-xs text-muted-foreground">
          {(() => {
            const pct = getFrontendPlatformFeePercent();
            const fee = calcPlatformFee(req.servicePrice, pct);
            const receive = Math.round((req.servicePrice - fee) * 100) / 100;
            return `Platform fee (${Math.round(pct * 100)}%): -${formatPi(fee)} · Provider receives: ${formatPi(receive)} · ${BLOCKCHAIN_GAS_LABEL}`;
          })()}
        </div>
        <Button
          size="sm"
          className="w-full"
          disabled={busy}
          onClick={() =>
            withBusy(async () => {
              if (recoveryInProgress) {
                pushToast("Resolving a previous payment, try again in a moment", "warning");
                return;
              }
              await payIntoEscrow(req, accessToken);
              await refreshRequests();
              pushToast("Payment locked in escrow", "success");
            })
          }
        >
          {busy ? "Processing…" : `Pay ${req.servicePrice} Pi to start`}
        </Button>

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
        onClick={() => withBusy(async () => setRequestStatus(req.id, "delivered"))}
      >
        {busy ? "Updating…" : "Mark as delivered"}
      </Button>
    );
  }

  if (req.direction === "outgoing" && req.status === "delivered") {
    return (
      <div className="flex gap-2">
        <Button
          variant="success"
          size="sm"
          className="flex-1"
          disabled={busy}
          onClick={() =>
            withBusy(async () => {
              await backendApi.hireRequests.release(req.id, accessToken);
              await refreshRequests();
              pushToast("Funds released to provider", "success");
              if (onReleased) onReleased(req);
            })
          }
        >
          {busy ? "Releasing…" : "Confirm & release payment"}
        </Button>
        {showDisputeForm ? (
          <div className="flex w-full flex-col gap-2 rounded-xl border border-border bg-secondary/30 p-3">
            <div className="text-xs font-semibold text-foreground">Submit dispute</div>
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
    return <p className="text-xs font-medium text-destructive">Disputed — awaiting resolution.</p>;
  }

  return null;
}
