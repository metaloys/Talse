"use client";

import {
  CATEGORY_MAP,
  deliveryLabel,
  formatPi,
  hueFromString,
  serviceImage,
  type Service,
} from "@/lib/services/data";
// fee breakdown removed from card view per UX request
import { Avatar, cx, Pill } from "./ui";
import { CategoryIcon, IconBolt, IconClock, IconStar } from "./icons";

function coverFor(service: Service): string {
  const img = service.coverImage ?? service.images[0];
  return img
    ? serviceImage(img, 600, 450)
    : "/placeholder.svg?height=450&width=600&query=service";
}

function RatingBadge({ service }: { service: Service }) {
  const count = service.ratingCount ?? 0;
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-card/90 px-2 py-1 text-[11px] font-bold text-foreground backdrop-blur ps-nums">
      <IconStar size={12} className="text-accent" />
      {(service.ratingAvg ?? 0).toFixed(1)}
      <span className="font-medium text-muted-foreground">({count})</span>
    </span>
  );
}

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
  const promoted = (service.boostedUntil ?? 0) > Date.now();
  const jobs = service.jobsCompleted ?? 0;
  return (
    <button
      onClick={onOpen}
      className={cx(
        "ps-card-hover ps-press group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left",
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-secondary">
        <img
          src={coverFor(service)}
          alt={service.title || "Service image"}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          loading="lazy"
        />
        <span
          className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-card/90 px-2 py-1 text-[11px] font-semibold backdrop-blur"
          style={{ color: `oklch(0.45 0.15 ${cat.hue})` }}
        >
          <CategoryIcon id={service.category} size={13} />
          {cat.short}
        </span>
        {promoted && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-foreground/85 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-background backdrop-blur">
            <IconBolt size={11} />
            Promoted
          </span>
        )}
        <span className="absolute bottom-2 left-2">
          <RatingBadge service={service} />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="ps-clamp-2 text-sm font-semibold leading-snug text-foreground">{service.title}</h3>
        <div className="flex items-center gap-1.5">
          <Avatar name={service.ownerName} hue={hueFromString(service.ownerName)} size={20} />
          <p className="ps-clamp-1 text-xs text-muted-foreground">
            {service.ownerName}
            {jobs > 0 && <span className="text-muted-foreground/80"> · {jobs} done</span>}
          </p>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
          <span className="text-sm font-bold text-primary ps-nums">{formatPi(service.price)}</span>
          {/* Fee breakdown intentionally hidden on listing card */}
          <Pill tone="neutral" className="text-[11px]">
            <IconClock size={12} />
            {deliveryLabel(service.deliveryId)}
          </Pill>
        </div>
      </div>
    </button>
  );
}

/**
 * Full-width spotlight card used for the home hero featured listing.
 * Text sits over a dark gradient so it stays readable on any photo.
 */
export function FeaturedCard({
  service,
  onOpen,
  label = "Featured",
}: {
  service: Service;
  onOpen: () => void;
  label?: string;
}) {
  const cat = CATEGORY_MAP[service.category];
  const jobs = service.jobsCompleted ?? 0;
  const count = service.ratingCount ?? 0;
  return (
    <button
      onClick={onOpen}
      className="ps-card-hover ps-press group relative block w-full overflow-hidden rounded-3xl border border-border text-left"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-secondary sm:aspect-[16/8]">
        {/* eslint-disable-next-line @next/next/no-img-element -- images are base64/data URIs or generated placeholders, not optimizable by next/image */}
        <img
          src={coverFor(service)}
          alt={service.title || "Service image"}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(12,4,28,0.88) 4%, rgba(12,4,28,0.4) 42%, rgba(12,4,28,0) 76%)",
          }}
        />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-foreground shadow-sm">
          <IconStar size={11} />
          {label}
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-white/85">
          <CategoryIcon id={service.category} size={13} />
          {cat.label}
          {count > 0 && (
            <span className="inline-flex items-center gap-1 ps-nums">
              · <IconStar size={12} className="text-accent" />
              {(service.ratingAvg ?? 0).toFixed(1)} ({count})
            </span>
          )}
        </div>
        <h3 className="ps-clamp-2 text-lg font-bold leading-tight text-white text-balance">{service.title}</h3>
        <p className="mt-0.5 text-xs text-white/80">
          by {service.ownerName}
          {jobs > 0 && ` · ${jobs} jobs done`}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span className="rounded-full bg-white/95 px-3 py-1.5 text-sm font-extrabold text-foreground ps-nums">
            {formatPi(service.price)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
            <IconClock size={13} />
            {deliveryLabel(service.deliveryId)}
          </span>
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
  const jobs = service.jobsCompleted ?? 0;
  const count = service.ratingCount ?? 0;
  return (
    <button
      onClick={onOpen}
      className="ps-card-hover ps-press flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-2.5 text-left"
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-secondary">
        <img
          src={serviceImage(service.coverImage ?? service.images[0] ?? "service", 160, 160)}
          alt={service.title || "Service image"}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold" style={{ color: `oklch(0.45 0.15 ${cat.hue})` }}>
            {cat.short}
          </p>
          {count > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-foreground ps-nums">
              <IconStar size={11} className="text-accent" />
              {(service.ratingAvg ?? 0).toFixed(1)}
            </span>
          )}
        </div>
        <h3 className="ps-clamp-1 text-sm font-semibold text-foreground">{service.title}</h3>
        <p className="ps-clamp-1 text-xs text-muted-foreground">
          by {service.ownerName}
          {jobs > 0 && <span className="text-muted-foreground/80"> · {jobs} done</span>}
        </p>
      </div>
      <span className="shrink-0 text-sm font-bold text-primary ps-nums">{formatPi(service.price)}</span>
    </button>
  );
}
