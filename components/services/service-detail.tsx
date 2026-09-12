"use client";

import { useState } from "react";
import {
  APP_NAME,
  CATEGORY_MAP,
  DISCLAIMER,
  deliveryLabel,
  formatPi,
  serviceImage,
  type Service,
} from "@/lib/services/data";
import { getFrontendPlatformFeePercent, calcPlatformFee, BLOCKCHAIN_GAS_LABEL } from "@/lib/frontend-fee-config";
import { useServices } from "@/contexts/services-context";
import { Overlay } from "./feedback";
import { Avatar, Button, Card, cx, IconButton, Pill } from "./ui";
import {
  CategoryIcon,
  IconChevronRight,
  IconClock,
  IconFlag,
  IconSend,
  IconShield,
} from "./icons";
import { hueFromString } from "@/lib/services/data";
import { BoostListing } from "./boost-listing";

export function ServiceDetail({
  service,
  open,
  onClose,
  onHire,
  onOpenProvider,
}: {
  service: Service | null;
  open: boolean;
  onClose: () => void;
  onHire: (service: Service) => void;
  onOpenProvider: (id: string) => void;
}) {
  const { pushToast, getService, getProvider } = useServices();
  const [active, setActive] = useState(0);

  const persistedService = service ? getService(service.id) : undefined;
  if (!persistedService) return null;
  service = persistedService as Service;
  const cat = CATEGORY_MAP[service.category];
  const provider = getProvider(service.ownerId);
  const images = service.images.length > 0 ? service.images : [""];
  const idx = Math.min(active, images.length - 1);
  const isMine = service.ownerId === "me" || provider?.isMe === true;

  return (
    <Overlay open={open} onClose={onClose} title="Service">
      <div className="mx-auto max-w-md pb-28">
        {/* gallery */}
        <div className="relative aspect-square w-full overflow-hidden bg-secondary">
          <img
            src={
              images[idx]
                ? serviceImage(images[idx], 800, 800)
                : "/placeholder.svg?height=800&width=800&query=service"
            }
            alt=""
            className="h-full w-full object-cover"
          />
          {images.length > 1 && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  aria-label={`Image ${i + 1}`}
                  onClick={() => setActive(i)}
                  className={cx(
                    "h-1.5 rounded-full transition-all",
                    i === idx ? "w-5 bg-white" : "w-1.5 bg-white/60",
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {images.length > 1 && (
          <div className="ps-no-scrollbar flex gap-2 overflow-x-auto px-4 pt-3">
            {images.map((q, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={cx(
                  "h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2",
                  i === idx ? "border-primary" : "border-transparent",
                )}
              >
                <img
                  src={q ? serviceImage(q, 120, 120) : "/placeholder.svg?height=120&width=120&query=service"}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="primary">
              <CategoryIcon id={service.category} size={13} />
              {cat.label}
            </Pill>
            <Pill tone="neutral">
              <IconClock size={13} />
              {deliveryLabel(service.deliveryId)}
            </Pill>
            {isMine && <Pill tone="accent">Your listing</Pill>}
          </div>

          <h1 className="text-xl font-bold leading-snug text-foreground text-balance">{service.title}</h1>

          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-primary ps-nums">{formatPi(service.price)}</span>
            <span className="text-sm text-muted-foreground">starting price</span>
          </div>

          <div className="mt-2 text-sm text-muted-foreground">
            {(() => {
              const pct = getFrontendPlatformFeePercent();
              const fee = calcPlatformFee(service.price, pct);
              const receive = Math.round((service.price - fee) * 100) / 100;
              return (
                <div>
                  <div className="font-medium">You pay: {formatPi(service.price)}</div>
                  <div className="text-xs">Platform fee ({Math.round(pct * 100)}%): -{formatPi(fee)} · You receive: {formatPi(receive)}</div>
                  <div className="text-xs">{BLOCKCHAIN_GAS_LABEL}</div>
                </div>
              );
            })()}
          </div>

          <Card className="p-4">
            <h2 className="mb-1.5 text-sm font-bold text-foreground">About this service</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {service.description || "No description provided."}
            </p>
          </Card>

          {/* provider */}
          <button
            onClick={() => onOpenProvider(provider?.id ?? persistedService.ownerId)}
            className="ps-press flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left"
          >
            <Avatar name={provider?.name ?? service.ownerName} hue={hueFromString(provider?.name ?? service.ownerName)} size={44} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{provider?.name ?? service.ownerName}</p>
              <p className="text-xs text-muted-foreground">View profile & other services</p>
            </div>
            <IconChevronRight size={18} className="text-muted-foreground" />
          </button>

          <Card className="flex items-start gap-2.5 bg-secondary/60 p-3.5">
            <IconShield size={18} className="mt-0.5 shrink-0 text-primary" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Agree on the details and terms with the provider before any work begins. {APP_NAME} does not verify or
              guarantee the trustworthiness of any user.
            </p>
          </Card>

          <button
            onClick={() => pushToast(`Report received. Thanks for helping keep ${APP_NAME} safe.`, "info")}
            className="ps-press flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
          >
            <IconFlag size={14} />
            Report this listing
          </button>

          <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">{DISCLAIMER}</p>
        </div>
      </div>

      {/* sticky action */}
      {!isMine && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 px-4 py-3 ps-safe-bottom backdrop-blur">
          <div className="mx-auto flex max-w-md items-center gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">Price</p>
              <p className="text-base font-bold text-primary ps-nums">{formatPi(service.price)}</p>
            </div>
            <Button className="flex-1" size="lg" onClick={() => onHire(persistedService)}>
              <IconSend size={18} />
              Hire
            </Button>
          </div>
        </div>
      )}
      {isMine && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 px-4 py-3 ps-safe-bottom backdrop-blur">
          <div className="mx-auto max-w-md">
            <BoostListing listingId={service.id} />
          </div>
        </div>
      )}
    </Overlay>
  );
}
