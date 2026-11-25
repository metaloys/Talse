"use client";

import { useEffect, useState } from "react";
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
import { backendApi } from "@/lib/backend-api";
import { Overlay } from "./feedback";
import { Avatar, Button, Card, cx, Pill } from "./ui";
import {
  CategoryIcon,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconFlag,
  IconSend,
  IconShield,
} from "./icons";
import { hueFromString } from "@/lib/services/data";
import { BoostListing } from "./boost-listing";
import { ReportSheet } from "./report-sheet";
import { ShareButton } from "./share-button";

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
  const { getService, getProvider } = useServices();
  const [active, setActive] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  // Catalogue responses carry only a cover thumbnail, so the full gallery is
  // fetched for the single listing being viewed. Until it arrives, the cover
  // keeps the gallery looking complete.
  const [fullImages, setFullImages] = useState<string[] | null>(null);
  const serviceId = service?.id ?? null;

  useEffect(() => {
    setActive(0);
    setFullImages(null);
    if (!open || !serviceId) return;
    let cancelled = false;
    backendApi.services
      .get(serviceId)
      .then((res) => {
        const imgs = res?.service?.images;
        if (!cancelled && Array.isArray(imgs) && imgs.length > 0) setFullImages(imgs);
      })
      .catch(() => {
        // Detail still renders from the cover; the gallery is a progressive
        // enhancement, not a requirement for the page to work.
      });
    return () => {
      cancelled = true;
    };
  }, [open, serviceId]);

  const persistedService = service ? getService(service.id) : undefined;
  if (!persistedService) return null;
  service = persistedService as Service;
  const cat = CATEGORY_MAP[service.category];
  const provider = getProvider(service.ownerId);
  const gallery = fullImages && fullImages.length > 0
    ? fullImages
    : service.coverImage
      ? [service.coverImage]
      : service.images;
  const images = gallery.length > 0 ? gallery : [""];
  const idx = Math.min(active, images.length - 1);
  const isMine = service.ownerId === "me" || provider?.isMe === true;

  const pct = getFrontendPlatformFeePercent();
  const fee = calcPlatformFee(service.price, pct);
  const receive = Math.round((service.price - fee) * 100) / 100;

  return (
    <Overlay open={open} onClose={onClose} title={service.title}>
      <div className="mx-auto max-w-5xl pb-28">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start lg:gap-6 lg:p-4">
          {/* gallery */}
          <div>
            <div className="relative aspect-square w-full overflow-hidden bg-secondary lg:rounded-2xl">
              <img
                src={
                  images[idx]
                    ? serviceImage(images[idx], 1000, 1000)
                    : "/placeholder.svg?height=800&width=800&query=service"
                }
                alt={service.title}
                className="h-full w-full object-cover"
              />
              <div className="absolute right-3 top-3">
                <ShareButton
                  iconOnly
                  label="Share this service"
                  title={`${service.title} · Talse`}
                  text={`${service.title} — ${formatPi(service.price)} on Talse.`}
                  path={`/services/${service.id}`}
                />
              </div>
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
              <div className="ps-no-scrollbar flex gap-2 overflow-x-auto px-4 pt-3 lg:px-0">
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
          </div>

          {/* details */}
          <div className="space-y-4 p-4 lg:p-0">
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

            <h1 className="text-xl font-bold leading-snug text-foreground text-balance sm:text-2xl">
              {service.title}
            </h1>

            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-primary ps-nums">{formatPi(service.price)}</span>
              <span className="text-sm text-muted-foreground">starting price</span>
            </div>

            {/* price + escrow breakdown */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">Payment breakdown</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  <IconShield size={11} />
                  Escrow
                </span>
              </div>
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-foreground">
                  <span>Held until you approve delivery</span>
                  <span className="font-semibold text-primary ps-nums">{formatPi(service.price)}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Platform fee ({Math.round(pct * 100)}%)</span>
                  <span className="ps-nums">-{formatPi(fee)} from payout</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Provider receives</span>
                  <span className="font-medium text-foreground ps-nums">{formatPi(receive)}</span>
                </div>
                <p className="border-t border-border pt-2 text-[11px] text-muted-foreground">{BLOCKCHAIN_GAS_LABEL}</p>
              </div>
            </Card>

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
                <p className="text-xs text-muted-foreground">
                  {(provider?.ratingCount ?? 0) > 0
                    ? `★ ${(provider?.ratingAvg ?? 0).toFixed(1)} · ${provider?.jobsCompleted ?? 0} jobs`
                    : "View profile & other services"}
                </p>
              </div>
              <IconChevronRight size={18} className="text-muted-foreground" />
            </button>

            {/* trust strip */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: <IconShield size={15} />, label: "Escrow safe" },
                { icon: <IconCheck size={15} />, label: "Pay when happy" },
                { icon: <IconClock size={15} />, label: deliveryLabel(service.deliveryId) },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card px-2 py-2.5 text-center text-[11px] font-semibold text-muted-foreground"
                >
                  <span className="text-primary">{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>

            <Card className="flex items-start gap-2.5 bg-secondary/60 p-3.5">
              <IconShield size={18} className="mt-0.5 shrink-0 text-primary" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Agree on the details and terms with the provider before any work begins. {APP_NAME} does not verify or
                guarantee the trustworthiness of any user.
              </p>
            </Card>

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setReportOpen(true)}
                className="ps-press flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
              >
                <IconFlag size={14} />
                Report this listing
              </button>
              <ShareButton
                variant="ghost"
                size="sm"
                label="Share"
                className="h-8 px-2 text-xs text-muted-foreground"
                title={`${service.title} · Talse`}
                text={`${service.title} — ${formatPi(service.price)} on Talse.`}
                path={`/services/${service.id}`}
              />
            </div>

            <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">{DISCLAIMER}</p>
          </div>
        </div>
      </div>

      {/* sticky action */}
      {!isMine && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 px-4 py-3 ps-safe-bottom backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground">Price · held in escrow</p>
              <p className="text-base font-bold text-primary ps-nums">{formatPi(service.price)}</p>
            </div>
            <Button className="min-w-[150px]" size="lg" onClick={() => onHire(persistedService)}>
              <IconSend size={18} />
              Hire
            </Button>
          </div>
        </div>
      )}
      {isMine && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 px-4 py-3 ps-safe-bottom backdrop-blur">
          <div className="mx-auto max-w-5xl">
            <BoostListing listingId={service.id} boostedUntil={service.boostedUntil} />
          </div>
        </div>
      )}

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="service"
        targetId={service.id}
        targetLabel={service.title}
      />
    </Overlay>
  );
}