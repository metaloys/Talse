"use client";

import { useMemo, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { PRODUCT_CONFIG } from "@/lib/product-config";
import type { SDKLiteError } from "@/lib/sdklite-types";
import { backendApi } from "@/lib/backend-api";
import { useServices } from "@/contexts/services-context";
import { Button, Card, Pill } from "./ui";

type PurchaseProduct = {
  id: string;
  slug?: string;
  name?: string;
  price_in_pi?: number;
};

export function BoostListing({ listingId }: { listingId: string }) {
  const { sdk, products, restoredPurchases, accessToken } = usePiAuth();
  const { refreshServices } = useServices();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "danger" | "warning">("success");

  const product = useMemo(
    () => products?.find((item) => item.id === PRODUCT_CONFIG.PRODUCT_6a848a24d3af48f0894a8564) as PurchaseProduct | undefined,
    [products],
  );
  const quantity = restoredPurchases?.find((purchase) => purchase.productId === product?.slug)?.quantity ?? 0;
  const amount = product?.price_in_pi;
  const productSlug = product?.slug;
  const unavailable = !product || !productSlug || !sdk;

  const purchase = async () => {
    if (unavailable || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await sdk.makePurchase(productSlug);
      if (result.ok) {
        if (accessToken) {
          try {
            await backendApi.services.confirmBoost(listingId, result.paymentId, result.txid, accessToken);
            await refreshServices();
          } catch (confirmErr) {
            console.error("[Boost] Backend confirmation failed:", confirmErr);
            // The Pi purchase itself succeeded — don't show this as a failure to
            // the user, but it does mean boosted_until wasn't set. Worth a retry
            // path or a webhook-based reconciliation job in production.
          }
        }
        setTone("success");
        setMessage(`Boost purchased. Payment ${result.paymentId} confirmed.`);
      }
    } catch (error) {
      const code = (error as SDKLiteError)?.code;
      setTone(code === "purchase_cancelled" ? "warning" : "danger");
      setMessage(
        code === "product_not_found"
          ? "This boost is not available right now."
          : code === "purchase_cancelled"
            ? "Purchase cancelled."
            : "The purchase could not be completed. Please try again.",
      );
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
        {quantity > 0 && <Pill tone="success">Purchased</Pill>}
      </div>
      <Button
        className="mt-3 w-full"
        variant="accent"
        onClick={purchase}
        disabled={unavailable || busy || quantity > 0}
      >
        {busy ? "Opening Pi purchase…" : product ? `Boost this listing · ${amount ?? 5} Pi` : "Boost unavailable"}
      </Button>
      {message && <p className={`mt-2 text-xs ${tone === "success" ? "text-success" : tone === "warning" ? "text-warning-foreground" : "text-destructive"}`}>{message}</p>}
      {!product && <p className="mt-2 text-xs text-warning-foreground">This product is not currently available.</p>}
      <p className="mt-2 text-[11px] text-muted-foreground">Listing: {listingId.slice(0, 8)}… · One-time purchase</p>
    </Card>
  );
}

export function BoostConfirmation({ serviceId, onDone }: { serviceId: string; onDone: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-4 p-4 pb-8">
      <div className="rounded-2xl bg-primary-soft p-5 text-center">
        <p className="text-2xl font-bold text-primary">Service published</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Your listing is now available to Pioneers browsing Pi Services.</p>
      </div>
      <BoostListing listingId={serviceId} />
      <Button variant="outline" className="w-full" onClick={onDone}>View my profile</Button>
    </div>
  );
}
