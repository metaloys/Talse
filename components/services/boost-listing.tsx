"use client";

import { useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { APP_NAME } from "@/lib/services/data";
import { backendApi } from "@/lib/backend-api";
import { useServices } from "@/contexts/services-context";
import { BOOST_DURATION_DAYS, BOOST_MEMO, BOOST_PRICE_PI } from "@/lib/boost-config";
import { track } from "@/lib/analytics";
import { Button, Card, Pill } from "./ui";

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function BoostListing({ listingId, boostedUntil }: { listingId: string; boostedUntil?: number }) {
  const { accessToken } = usePiAuth();
  const { refreshServices } = useServices();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "warning" | "danger">("success");
  const [activeUntil, setActiveUntil] = useState<number | null>(boostedUntil ?? null);

  const active = (activeUntil ?? 0) > Date.now();
  const paymentReady = typeof window !== "undefined" && typeof window.Pi?.createPayment === "function";
  const unavailable = !accessToken || !paymentReady;

  const post = async (path: string, payload: Record<string, unknown>) => {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(typeof data?.error === "string" ? data.error : "The purchase could not be confirmed.");
    }
    return res.json().catch(() => ({}));
  };

  const purchase = async () => {
    if (unavailable || busy || !accessToken) return;
    setBusy(true);
    setMessage(null);
    let cancelled = false;

    try {
      await new Promise<void>((resolve, reject) => {
        window.Pi.createPayment(
          {
            amount: BOOST_PRICE_PI,
            memo: BOOST_MEMO,
            metadata: { kind: "boost", serviceId: listingId },
          },
          {
            onReadyForServerApproval: async (paymentId: string) => {
              try {
                await post("/api/payments/boost/approve", { paymentId, serviceId: listingId });
              } catch (err) {
                reject(err);
              }
            },
            onReadyForServerCompletion: async (paymentId: string, txid: string) => {
              try {
                await post("/api/payments/boost/complete", { paymentId, txid, serviceId: listingId });
                const { boostedUntil: until } = await backendApi.services.confirmBoost(
                  listingId,
                  paymentId,
                  txid,
                  accessToken,
                );
                const untilMs = until ? new Date(until).getTime() : Date.now();
                setActiveUntil(untilMs);
                setTone("success");
                setMessage(`Boost active until ${formatDay(untilMs)}.`);
                track("boost_purchased", { serviceId: listingId, amount: BOOST_PRICE_PI, days: BOOST_DURATION_DAYS });
                await refreshServices();
                resolve();
              } catch (err) {
                reject(err);
              }
            },
            onCancel: () => {
              cancelled = true;
              reject(new Error("cancelled"));
            },
            onError: (error: unknown) => reject(error instanceof Error ? error : new Error(String(error))),
          },
        );
      });
    } catch (err) {
      if (cancelled) {
        setTone("warning");
        setMessage("Purchase cancelled.");
      } else {
        console.error("[Boost] purchase failed:", err);
        setTone("danger");
        setMessage(err instanceof Error ? err.message : "The purchase could not be completed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-accent/30 bg-accent-soft/35 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-foreground">Featured Listing Boost</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Place this listing at the top of Home and Category feeds for 7 days.
          </p>
        </div>
        {active && <Pill tone="success">Boosted</Pill>}
      </div>
      <Button
        className="mt-3 w-full"
        variant="accent"
        onClick={purchase}
        disabled={unavailable || busy}
      >
        {busy
          ? "Opening Pi payment…"
          : active
            ? `Extend boost · ${BOOST_PRICE_PI} π`
            : `Boost this listing · ${BOOST_PRICE_PI} π`}
      </Button>
      {active && activeUntil && (
        <p className="mt-2 text-xs text-success">Active until {formatDay(activeUntil)}.</p>
      )}
      {!paymentReady && (
        <p className="mt-2 text-xs text-warning-foreground">Open {APP_NAME} in Pi Browser to buy a boost.</p>
      )}
      {paymentReady && !accessToken && (
        <p className="mt-2 text-xs text-warning-foreground">Sign in with Pi to buy a boost.</p>
      )}
      {message && (
        <p className={`mt-2 text-xs ${tone === "success" ? "text-success" : tone === "warning" ? "text-warning-foreground" : "text-destructive"}`}>
          {message}
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">Listing: {listingId.slice(0, 8)}… · One-time purchase</p>
    </Card>
  );
}

export function BoostConfirmation({ serviceId, onDone }: { serviceId: string; onDone: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-4 p-4 pb-8">
      <div className="rounded-2xl bg-primary-soft p-5 text-center">
        <p className="text-2xl font-bold text-primary">Service published</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Your listing is now available to Pioneers browsing {APP_NAME}.</p>
      </div>
      <BoostListing listingId={serviceId} />
      <Button variant="outline" className="w-full" onClick={onDone}>View my profile</Button>
    </div>
  );
}
