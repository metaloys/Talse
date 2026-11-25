"use client";

import { useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { APP_NAME } from "@/lib/services/data";
import { backendApi } from "@/lib/backend-api";
import { useServices } from "@/contexts/services-context";
import { usePublicConfig } from "@/lib/public-config";
import { track } from "@/lib/analytics";
import { Button, Card, cx, Pill } from "./ui";
import { IconBolt, IconShield } from "./icons";

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function BoostListing({ listingId, boostedUntil }: { listingId: string; boostedUntil?: number }) {
  const { accessToken } = usePiAuth();
  const { refreshServices } = useServices();
  const config = usePublicConfig();
  const boostPrice = config.boostPricePi;
  const boostDays = config.boostDurationDays;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "warning" | "danger">("success");
  const [activeUntil, setActiveUntil] = useState<number | null>(boostedUntil ?? null);
  // Buying a boost is a money move, so it confirms before opening the Pi
  // payment sheet rather than firing on a single tap.
  const [confirm, setConfirm] = useState(false);

  const active = (activeUntil ?? 0) > Date.now();
  const daysLeft = active ? Math.max(1, Math.ceil(((activeUntil ?? 0) - Date.now()) / 86_400_000)) : 0;
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
    setConfirm(false);
    setBusy(true);
    setMessage(null);
    let cancelled = false;

    try {
      await new Promise<void>((resolve, reject) => {
        window.Pi.createPayment(
          {
            amount: boostPrice,
            memo: config.boostMemo,
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
                track("boost_purchased", { serviceId: listingId, amount: boostPrice, days: boostDays });
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

  const benefit = `Top of Home and category feeds for ${boostDays} day${boostDays === 1 ? "" : "s"}.`;

  return (
    <Card className="border-accent/30 bg-accent-soft/35 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-foreground">
            <IconBolt size={18} />
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">Featured listing boost</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{benefit}</p>
          </div>
        </div>
        {active ? <Pill tone="success">Boosted</Pill> : <Pill tone="neutral">{boostPrice} π</Pill>}
      </div>

      {active && activeUntil && (
        <p className="mt-3 rounded-lg bg-success-soft px-2.5 py-1.5 text-xs font-medium text-success">
          Active until {formatDay(activeUntil)} · {daysLeft} day{daysLeft === 1 ? "" : "s"} left
        </p>
      )}

      {confirm ? (
        <div className="mt-3 space-y-2 rounded-xl border border-accent/40 bg-card/60 p-3 text-left">
          <div className="flex items-start gap-2">
            <IconShield size={16} className="mt-0.5 shrink-0 text-accent-foreground" />
            <div>
              <p className="text-xs font-semibold text-foreground">
                {active ? "Extend" : "Boost"} this listing for {boostPrice} π?
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {benefit} The Pi is charged once when you confirm in the Pi payment sheet.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" variant="accent" onClick={() => void purchase()} disabled={busy}>
              {busy ? "Opening Pi payment…" : `Confirm · ${boostPrice} π`}
            </Button>
            <Button className="flex-1" variant="outline" onClick={() => setConfirm(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          className="mt-3 w-full"
          variant="accent"
          onClick={() => setConfirm(true)}
          disabled={unavailable || busy}
        >
          {busy ? "Opening Pi payment…" : active ? `Extend boost · ${boostPrice} π` : `Boost this listing · ${boostPrice} π`}
        </Button>
      )}

      {!paymentReady && (
        <p className="mt-2 text-xs text-warning-foreground">Open {APP_NAME} in Pi Browser to buy a boost.</p>
      )}
      {paymentReady && !accessToken && (
        <p className="mt-2 text-xs text-warning-foreground">Sign in with Pi to buy a boost.</p>
      )}
      {message && (
        <p
          className={cx(
            "mt-2 text-xs",
            tone === "success" ? "text-success" : tone === "warning" ? "text-warning-foreground" : "text-destructive",
          )}
        >
          {message}
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">One-time purchase · applies immediately after payment.</p>
    </Card>
  );
}

export function BoostConfirmation({ serviceId, onDone }: { serviceId: string; onDone: () => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 pb-8">
      <div className="rounded-2xl bg-primary-soft p-5 text-center">
        <p className="text-2xl font-bold text-primary">Service published</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your listing is now available to Pioneers browsing {APP_NAME}.
        </p>
      </div>
      <BoostListing listingId={serviceId} />
      <Button variant="outline" className="w-full" onClick={onDone}>View my profile</Button>
    </div>
  );
}
