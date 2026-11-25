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
import { ServiceCard } from "./service-card";
import { ReportSheet } from "./report-sheet";
import { ShareButton } from "./share-button";

function successPct(jobsCompleted: number, refunds: number): string {
  const total = jobsCompleted + refunds;
  if (total < 3) return "New";
  return `${Math.round((jobsCompleted / total) * 100)}%`;
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

function StarRow({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <IconStar
          key={i}
          size={size}
          filled={i < Math.round(value)}
          className={i < Math.round(value) ? "text-accent" : "text-border"}
        />
      ))}
    </span>
  );
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

  const totalReviews = reviews?.length ?? 0;
  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: (reviews ?? []).filter((r) => Math.round(Number(r.rating)) === star).length,
  }));

  return (
    <Overlay open={open} onClose={onClose} title={provider ? provider.name : "Provider"}>
      {!provider ? (
        <div className="mx-auto max-w-4xl p-4">
          {loadingProvider || !providerMissing ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading provider...</p>
          ) : (
            <EmptyState title="Provider not found" message="This provider is no longer available." />
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-4xl space-y-5 p-4 pb-10">
          {/* hero */}
          <div className="ps-hero-rich rounded-2xl border border-border p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-4">
                <Avatar name={provider.name} hue={hueFromString(provider.name)} size={72} />
                <div className="min-w-0">
                  <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{provider.name}</h1>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {provider.isMe && <Pill tone="accent">You</Pill>}
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <IconCalendar size={13} />
                      Since {formatMonthYear(provider.joinedAt)}
                    </span>
                    {(provider.totalEarned ?? 0) >= 100 && renderEarningsBadge(provider.totalEarned ?? 0)}
                  </div>
                  {provider.location && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <IconPin size={15} />
                      {provider.location}
                    </p>
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

            {provider.bio && (
              <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-foreground">{provider.bio}</p>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Rating</p>
                <p className="mt-1 flex items-center gap-1 text-lg font-bold text-foreground">
                  {(provider.ratingCount ?? 0) > 0 ? (provider.ratingAvg ?? 0).toFixed(1) : "—"}
                  {(provider.ratingCount ?? 0) > 0 && <IconStar size={13} filled className="text-accent" />}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {provider.ratingCount ?? 0} review{(provider.ratingCount ?? 0) === 1 ? "" : "s"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Jobs</p>
                <p className="mt-1 text-lg font-bold text-foreground ps-nums">{provider.jobsCompleted ?? 0}</p>
                <p className="text-[11px] text-muted-foreground">completed</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Success</p>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {successPct(provider.jobsCompleted ?? 0, provider.refundsAgainstProvider ?? 0)}
                </p>
                <p className="text-[11px] text-muted-foreground">delivery rate</p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
            {/* services */}
            <section>
              <h2 className="mb-3 text-sm font-bold text-foreground">
                Services{services.length > 0 ? ` (${services.length})` : ""}
              </h2>
              {services.length === 0 ? (
                <EmptyState
                  icon={<IconInbox size={26} />}
                  title="No active services"
                  message="This provider has no active listings right now."
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {services.map((s) => (
                    <ServiceCard key={s.id} service={s} onOpen={() => onOpenService(s)} />
                  ))}
                </div>
              )}
            </section>

            {/* reviews */}
            <aside>
              <h2 className="mb-3 text-sm font-bold text-foreground">Reviews</h2>
              {reviews === null ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : reviews.length === 0 ? (
                <EmptyState title="No reviews yet" message="This provider has no reviews yet." />
              ) : (
                <div className="space-y-3">
                  <Card className="p-4">
                    <div className="flex items-center gap-3">
                      <p className="text-3xl font-extrabold text-foreground ps-nums">
                        {(provider.ratingAvg ?? 0).toFixed(1)}
                      </p>
                      <div>
                        <StarRow value={provider.ratingAvg ?? 0} />
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {totalReviews} review{totalReviews === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {distribution.map(({ star, count }) => (
                        <div key={star} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="w-2 text-right ps-nums">{star}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{ width: totalReviews ? `${(count / totalReviews) * 100}%` : "0%" }}
                            />
                          </div>
                          <span className="w-5 text-right ps-nums">{count}</span>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <div className="space-y-2">
                    {reviews.slice(0, 6).map((r) => (
                      <Card key={r.id} className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="ps-clamp-1 text-sm font-medium text-foreground">
                              {r.reviewer_name || "Anonymous"}
                            </p>
                            <StarRow value={Number(r.rating) || 0} size={11} />
                          </div>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {r.created_at ? timeAgo(new Date(r.created_at).getTime()) : ""}
                          </span>
                        </div>
                        {r.text && <p className="mt-2 text-sm leading-relaxed text-foreground">{r.text}</p>}
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </aside>
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