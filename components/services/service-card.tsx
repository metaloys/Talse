"use client";

import {
  CATEGORY_MAP,
  deliveryLabel,
  formatPi,
  serviceImage,
  type Service,
} from "@/lib/services/data";
import { cx, Pill } from "./ui";
import { CategoryIcon, IconClock } from "./icons";

export function ServiceCard({
  service,
  onOpen,
  className,
}: {
  service: Service;
  onOpen: () => void;
  className?: string;
}) {
  const cat = CATEGORY_MAP[service.category];
  const img = service.images[0];
  return (
    <button
      onClick={onOpen}
      className={cx(
        "ps-press group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left",
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-secondary">
        <img
          src={img ? serviceImage(img, 600, 450) : "/placeholder.svg?height=450&width=600&query=service"}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <span
          className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-card/90 px-2 py-1 text-[11px] font-semibold text-foreground backdrop-blur"
          style={{ color: `oklch(0.45 0.15 ${cat.hue})` }}
        >
          <CategoryIcon id={service.category} size={13} />
          {cat.short}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="ps-clamp-2 text-sm font-semibold leading-snug text-foreground">{service.title}</h3>
        <p className="ps-clamp-1 text-xs text-muted-foreground">by {service.ownerName}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-sm font-bold text-primary ps-nums">{formatPi(service.price)}</span>
          <Pill tone="neutral" className="text-[11px]">
            <IconClock size={12} />
            {deliveryLabel(service.deliveryId)}
          </Pill>
        </div>
      </div>
    </button>
  );
}

export function ServiceRow({
  service,
  onOpen,
}: {
  service: Service;
  onOpen: () => void;
}) {
  const cat = CATEGORY_MAP[service.category];
  const img = service.images[0];
  return (
    <button
      onClick={onOpen}
      className="ps-press flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-2.5 text-left"
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-secondary">
        <img
          src={img ? serviceImage(img, 160, 160) : "/placeholder.svg?height=160&width=160&query=service"}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold" style={{ color: `oklch(0.45 0.15 ${cat.hue})` }}>
          {cat.short}
        </p>
        <h3 className="ps-clamp-1 text-sm font-semibold text-foreground">{service.title}</h3>
        <p className="ps-clamp-1 text-xs text-muted-foreground">by {service.ownerName}</p>
      </div>
      <span className="shrink-0 text-sm font-bold text-primary ps-nums">{formatPi(service.price)}</span>
    </button>
  );
}
