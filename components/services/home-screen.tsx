"use client";

import {
  APP_NAME,
  APP_TAGLINE,
  CATEGORIES,
  DISCLAIMER,
  FEATURED_IDS,
  type CategoryId,
  type Service,
} from "@/lib/services/data";
import { useServices } from "@/contexts/services-context";
import { Button, Card, cx } from "./ui";
import { CategoryIcon, IconArrowRight, IconLogo, IconPlus, IconSparkle } from "./icons";
import { ServiceCard } from "./service-card";

export function HomeScreen({
  onOpenService,
  onOpenCategory,
  onCreate,
  onSeeAll,
}: {
  onOpenService: (s: Service) => void;
  onOpenCategory: (c: CategoryId) => void;
  onCreate: () => void;
  onSeeAll: () => void;
}) {
  const { allServices, username, hasMore, loadMoreServices } = useServices();

  const featured = FEATURED_IDS.map((id) => allServices.find((s) => s.id === id)).filter(
    (s): s is Service => Boolean(s),
  );
  const recent = allServices.slice(0, 6);

  return (
    <div className="mx-auto max-w-md pb-24">
      {/* hero */}
      <div className="ps-hero-grad px-4 pb-5 pt-4 ps-safe-top">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <IconLogo size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight text-foreground">{APP_NAME}</h1>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Hi {username} 👋</p>
        <h2 className="mt-1 text-2xl font-bold leading-tight text-foreground text-balance">
          Find the right help, or offer your own.
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{APP_TAGLINE}</p>
        <Button className="mt-4 w-full" size="lg" onClick={onCreate}>
          <IconPlus size={18} />
          Create a service
        </Button>
      </div>

      <div className="space-y-6 px-4 pt-5">
        {/* categories */}
        <section>
          <h3 className="mb-2.5 text-sm font-bold text-foreground">Browse by category</h3>
          <div className="ps-no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => onOpenCategory(c.id)}
                className="ps-press flex w-24 shrink-0 flex-col items-center gap-2 rounded-2xl border border-border bg-card p-3"
              >
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{
                    background: `oklch(0.95 0.05 ${c.hue})`,
                    color: `oklch(0.45 0.16 ${c.hue})`,
                  }}
                >
                  <CategoryIcon id={c.id} size={22} />
                </span>
                <span className="text-center text-[11px] font-semibold leading-tight text-foreground">{c.short}</span>
              </button>
            ))}
          </div>
        </section>

        {/* featured */}
        {featured.length > 0 && (
          <section>
            <div className="mb-2.5 flex items-center gap-1.5">
              <IconSparkle size={16} className="text-accent-foreground" />
              <h3 className="text-sm font-bold text-foreground">Featured services</h3>
            </div>
            <div className="ps-no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
              {featured.map((s) => (
                <ServiceCard key={s.id} service={s} onOpen={() => onOpenService(s)} className="w-44 shrink-0" />
              ))}
            </div>
          </section>
        )}

        {/* recent */}
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Recent listings</h3>
            <button onClick={onSeeAll} className="ps-press inline-flex items-center gap-1 text-sm font-semibold text-primary">
              See all
              <IconArrowRight size={15} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {recent.map((s) => (
              <ServiceCard key={s.id} service={s} onOpen={() => onOpenService(s)} />
            ))}
          </div>
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button onClick={() => loadMoreServices()}>
                Load more
              </Button>
            </div>
          )}
        </section>

        {/* disclaimer footer */}
        <Card className="bg-secondary/50 p-4">
          <p className="text-[11px] leading-relaxed text-muted-foreground">{DISCLAIMER}</p>
        </Card>
      </div>
    </div>
  );
}
