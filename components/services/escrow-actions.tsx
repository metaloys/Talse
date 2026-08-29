"use client";

import { useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { useServices } from "@/contexts/services-context";
import { backendApi } from "@/lib/backend-api";
import type { HireRequest } from "@/lib/services/data";
import { Button } from "./ui";

/**
 * Buyer pays into escrow for an accepted request. Uses the real
 * window.Pi.createPayment flow — onReadyForServerApproval/Completion call
 * our own /api/payments/approve + /complete routes, which verify with the
 * Pi Platform API before marking the request 'locked'.
 * Docs: https://github.com/pi-apps/pi-platform-docs/blob/master/payments.md
 */
function payIntoEscrow(req: HireRequest, accessToken: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.Pi?.createPayment) {
      reject(new Error("Pi payments are not available in this environment"));
      return;
    }
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

export function EscrowActions({ req }: { req: HireRequest }) {
  const { accessToken } = usePiAuth();
  const { refreshRequests, setRequestStatus, pushToast } = useServices();
  const [busy, setBusy] = useState(false);

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error("[Escrow] Action failed:", err);
      pushToast(err instanceof Error ? err.message : "Action failed", "warning");
    } finally {
      setBusy(false);
    }
  };

  if (!accessToken) return null;

  // Buyer, request accepted -> pay into escrow.
  if (req.direction === "outgoing" && req.status === "accepted") {
    return (
      <Button
        size="sm"
        className="w-full"
        disabled={busy}
        onClick={() =>
          withBusy(async () => {
            await payIntoEscrow(req, accessToken);
            await refreshRequests();
            pushToast("Payment locked in escrow", "success");
          })
        }
      >
        {busy ? "Processing…" : `Pay ${req.servicePrice} Pi to start`}
      </Button>
    );
  }

  // Provider, funds locked -> mark delivered.
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

  // Buyer, work delivered -> confirm and release funds.
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
            })
          }
        >
          {busy ? "Releasing…" : "Confirm & release payment"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => withBusy(async () => setRequestStatus(req.id, "disputed"))}
        >
          Dispute
        </Button>
      </div>
    );
  }

  // Either party, disputed -> flag only (resolution happens in admin-panel.tsx).
  if (req.status === "disputed") {
    return <p className="text-xs font-medium text-destructive">Disputed — awaiting resolution.</p>;
  }

  return null;
}
