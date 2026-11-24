"use client";

import React, { useEffect, useState } from "react";
import {
  DISCLAIMER,
  formatMonthYear,
  hueFromString,
  timeAgo,
  type Service,
} from "@/lib/services/data";
import { useServices } from "@/contexts/services-context";
import { Overlay } from "./feedback";
import { Avatar, Card, EmptyState, Pill } from "./ui";
import { IconCalendar, IconFlag, IconInbox, IconPin, IconStar } from "./icons";
import { ServiceRow } from "./service-card";
import { ReportSheet } from "./report-sheet";
import { ShareButton } from "./share-button";

function renderSuccessRate(jobsCompleted: number, refunds: number) {
  const total = jobsCompleted + refunds;
  if (total < 3) return "New provider";
  const pct = Math.round((jobsCompleted / total) * 100);
  return `${pct}% success`;
}

function renderEarningsBadge(totalEarned: number) {
  if (!totalEarned || totalEarned < 100) return null;
  const thresholds = [100, 500, 1000, 5000, 10000, 50000];
  let pick = 0;
  for (const t of thresholds) {
    if (totalEarned >= t) pick = t;
    else break;
  }
  if (!pick) return null;
  return <span className="inline-flex items-center rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">{`${pick}+ π earned`}</span>;
}

export function ProviderProfile({
  providerId,
  open,
  onClose,
  onOpenService,
}: {
  providerId: string | null;
  open: boolean;
  onClose: () => void;
  onOpenService: (service: Service) => void;
}) {
  const { getProvider, servicesByProvider, ensureProvider } = useServices();

  const provider = providerId ? getProvider(providerId) : undefined;
  const services = providerId ? servicesByProvider(providerId) : [];
  const [reviews, setReviews] = useState<any[] | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  // A provider opened from a shared link may not be in the loaded catalogue
  // yet, so load them (and their listings) on demand instead of flashing
  // "Provider not found".
  const [loadingProvider, setLoadingProvider] = useState(false);
  const [providerMissing, setProviderMissing] = useState(false);

  useEffect(() => {
    if (!open || !providerId) {
      setLoadingProvider(false);
      setProviderMissing(false);
      return;
    }
    let cancelled = false;
    if (!provider) setLoadingProvider(true);
    void ensureProvider(providerId).then((loaded) => {
      if (cancelled) return;
      setLoadingProvider(false);
      setProviderMissing(!loaded);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, providerId]);

  useEffect(() => {
    let mounted = true;
    if (!open || !providerId) {
      setReviews(null);
      return;
    }
    setReviews([]);
    // fetch reviews for provider
    (async () => {
      try {
        const res = await fetch(`/api/reviews?provider=${encodeURIComponent(providerId)}`);
        if (!res.ok) throw new Error("Failed to load reviews");
        const data = await res.json();
        if (!mounted) return;
        setReviews(Array.isArray(data.reviews) ? data.reviews : []);
      } catch (err) {
        if (!mounted) return;
        setReviews([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [open, providerId]);

  return (
    <Overlay open={open} onClose={onClose} title="Provider">
      {!provider ? (
        <div className="mx-auto max-w-md p-4">
          {loadingProvider || !providerMissing ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading provider…</p>
          ) : (
            <EmptyState title="Provider not found" message="This provider is no longer available." />
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-md space-y-4 p-4 pb-10">
          <div className="ps-hero-grad rounded-2xl border border-border p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={provider.name} hue={hueFromString(provider.name)} size={60} />
                <div className="min-w-0">
                <h1 className="text-lg font-bold text-foreground">{provider.name}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {provider.isMe && <Pill tone="accent">You</Pill>}
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <IconCalendar size={13} />
                    Since {formatMonthYear(provider.joinedAt)}
                  </span>
                  <span className="inline-flex items-center gap-3 text-xs text-muted-foreground">
                    {provider.ratingCount === 0 ? (
                      <span className="text-xs text-muted-foreground">No reviews yet</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <IconStar size={12} filled className="text-accent-foreground" />
                        {provider.ratingAvg.toFixed(1)} ({provider.ratingCount})
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{provider.jobsCompleted ?? 0} jobs</span>
                    <span className="text-xs text-muted-foreground">{renderSuccessRate(provider.jobsCompleted ?? 0, provider.refundsAgainstProvider ?? 0)}</span>
                  </span>
                </div>
                {(provider.totalEarned ?? 0) >= 100 && (
                  <div className="mt-2">{renderEarningsBadge(provider.totalEarned ?? 0)}</div>
                )}
                </div>
              </div>
              <ShareButton
                iconOnly
                label="Share this provider"
                title={`${provider.name} · Talse`}
                text={`${provider.name} is on Talse — hire them with Pi.`}
                path={`/providers/${provider.id}`}
              />
            </div>
            {provider.location && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <IconPin size={15} />
                {provider.location}
              </p>
            )}
            {provider.bio && (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{provider.bio}</p>
            )}
          </div>

          <div>
            <h2 className="mb-2.5 px-1 text-sm font-bold text-foreground">
              Services{services.length > 0 ? ` (${services.length})` : ""}
            </h2>
            {services.length === 0 ? (
              <EmptyState
                icon={<IconInbox size={26} />}
                title="No active services"
                message="This provider has no active listings right now."
              />
            ) : (
              <div className="space-y-2.5">
                {services.map((s) => (
                  <ServiceRow key={s.id} service={s} onOpen={() => onOpenService(s)} />
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-2.5 px-1 text-sm font-bold text-foreground">Reviews</h2>
            {reviews === null ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : reviews.length === 0 ? (
              <EmptyState title="No reviews yet" message="This provider has no reviews yet." />
            ) : (
              <div className="space-y-3">
                {reviews.map((r) => (
                  <Card key={r.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{r.reviewer_name || "Anonymous"}</div>
                      <div className="text-sm text-muted-foreground">★ {Number(r.rating).toFixed(1)}</div>
                    </div>
                    {r.text && <p className="mt-2 text-sm text-foreground">{r.text}</p>}
                    <div className="mt-2 text-xs text-muted-foreground">{timeAgo(new Date(r.created_at).getTime())}</div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {!provider.isMe && (
            <button
              onClick={() => setReportOpen(true)}
              className="ps-press flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <IconFlag size={14} />
              Report this user
            </button>
          )}

          <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">{DISCLAIMER}</p>

          <ReportSheet
            open={reportOpen}
            onClose={() => setReportOpen(false)}
            targetType="user"
            targetId={providerId ?? ""}
            targetLabel={provider.name}
          />
        </div>
      )}
    </Overlay>
  );
}
