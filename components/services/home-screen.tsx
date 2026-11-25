"use client";

import {
  APP_NAME,
  CATEGORIES,
  DISCLAIMER,
  type CategoryId,
  type Service,
} from "@/lib/services/data";
import { useServices } from "@/contexts/services-context";
import { Button, EmptyState, ServiceGridSkeleton } from "./ui";
import {
  CategoryIcon,
  IconArrowRight,
  IconBolt,
  IconCheckCircle,
  IconLogo,
  IconPlus,
  IconSearch,
  IconShield,
  IconSparkle,
  IconWallet,
} from "./icons";
import { FeaturedCard, ServiceCard, ServiceRow } from "./service-card";

export function HomeScreen({
  onOpenService,
  onOpenCategory,
  onCreate,
  onSeeAll,
  onSearch,
  headerAction,
}: {
  onOpenService: (s: Service) => void;
  onOpenCategory: (c: CategoryId) => void;
  onCreate: () => void;
  onSeeAll: () => void;
  onSearch: () => void;
  headerAction?: React.ReactNode;
}) {
  const { allServices, username, hasMore, loadMoreServices, ready } = useServices();

  // Promoted listings come from paid boosts (boosted_until), not a hardcoded
  // list — a static id list can never match real rows.
  const now = Date.now();
  const promoted = allServices.filter((s) => (s.boostedUntil ?? 0) > now);
  const featured = promoted[0] ?? allServices[0] ?? null;
  const promotedRest = promoted.filter((s) => s.id !== featured?.id).slice(0, 8);
  const promotedIds = new Set(promoted.map((s) => s.id));
  const fresh = allServices.filter((s) => s.id !== featured?.id && !promotedIds.has(s.id)).slice(0, 8);
  const browse = allServices.slice(0, 10);

  const providerCount = new Set(allServices.map((s) => s.ownerId)).size;
  const isLoading = !ready && allServices.length === 0;
  const isEmpty = ready && allServices.length === 0;

  return (
    <div className="mx-auto max-w-6xl pb-24 lg:pb-14">
      {/* hero */}
      <div className="ps-hero-rich ps-safe-top">
        <div className="px-4 pb-5 pt-4 sm:px-6">
          {/* On mobile this row is the app header; on desktop TopNav already
              shows the logo and name, so hide it to avoid a duplicate. */}
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <IconLogo size={20} />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold leading-tight text-foreground">{APP_NAME}</h1>
              </div>
            </div>
            {headerAction}
          </div>

          <p className="ps-eyebrow mt-4 text-primary">Pi services marketplace</p>
          <h2 className="mt-1.5 text-[26px] font-extrabold leading-[1.12] tracking-tight text-foreground text-balance sm:text-4xl">
            Hire Pi talent. <span className="text-primary">Get real work done.</span>
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Hi {username} 👋 Browse services from Pioneers like you. Pay with escrow and release
            only when you&apos;re happy.
          </p>

          <button
            onClick={onSearch}
            className="ps-press mt-4 flex h-12 w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 text-left shadow-sm"
            aria-label="Search services"
          >
            <IconSearch className="h-5 w-5 shrink-0 text-primary" />
            <span className="text-sm text-muted-foreground">Search services, skills or people…</span>
          </button>

          {/* categories */}
          <div className="ps-no-scrollbar -mx-4 mt-3.5 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => onOpenCategory(c.id)}
                className="ps-press inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-semibold text-foreground backdrop-blur"
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full"
                  style={{ background: `oklch(0.95 0.05 ${c.hue})`, color: `oklch(0.45 0.16 ${c.hue})` }}
                >
                  <CategoryIcon id={c.id} size={13} />
                </span>
                {c.short}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-7 px-4 pt-5 sm:px-6">
        {/* trust band — the one deep surface that gives the light UI contrast */}
        <div className="ps-ink-band rounded-2xl px-4 py-4 shadow-lg shadow-primary/10">
          <div className="grid grid-cols-3 gap-3">
            <TrustItem icon={<IconShield size={17} />} title="Escrow-safe" sub="Held until you approve" />
            <TrustItem icon={<IconWallet size={17} />} title="Paid in Pi" sub="No card needed" />
            <TrustItem icon={<IconCheckCircle size={17} />} title="Real reviews" sub="From past buyers" />
          </div>
          {allServices.length > 0 && (
            <p className="mt-3.5 border-t border-white/15 pt-3 text-center text-[11px] font-medium text-white/70">
              {allServices.length} live {allServices.length === 1 ? "listing" : "listings"} ·{" "}
              {providerCount} {providerCount === 1 ? "Pioneer" : "Pioneers"} offering work
            </p>
          )}
        </div>

        {isLoading ? (
          <ServiceGridSkeleton count={4} />
        ) : isEmpty ? (
          <EmptyState
            icon={<IconSparkle size={26} />}
            title="Be a founding provider"
            message="The marketplace is just getting started. List a skill you have and be one of the first Pioneers earning on Talse."
            action={
              <Button onClick={onCreate}>
                <IconPlus size={17} />
                Create your first service
              </Button>
            }
          />
        ) : (
          <>
            {featured && (
              <section>
                <SectionHeading
                  title="Featured today"
                  action={
                    <button
                      onClick={onCreate}
                      className="ps-press inline-flex items-center gap-1 text-sm font-semibold text-primary"
                    >
                      <IconPlus size={15} />
                      Sell your skills
                    </button>
                  }
                />
                <FeaturedCard
                  service={featured}
                  onOpen={() => onOpenService(featured)}
                  label={promoted.length > 0 ? "Promoted" : "Featured"}
                />
              </section>
            )}

            {promotedRest.length > 0 && (
              <Rail
                title="Promoted services"
                icon={<IconBolt size={15} className="text-accent-foreground" />}
                services={promotedRest}
                onOpenService={onOpenService}
              />
            )}

            {fresh.length > 0 && (
              <Rail
                title="Fresh on Talse"
                icon={<IconSparkle size={15} className="text-primary" />}
                services={fresh}
                onOpenService={onOpenService}
              />
            )}

            <section>
              <SectionHeading
                title="Browse services"
                action={
                  <button
                    onClick={onSeeAll}
                    className="ps-press inline-flex items-center gap-1 text-sm font-semibold text-primary"
                  >
                    See all
                    <IconArrowRight size={15} />
                  </button>
                }
              />
              <div className="grid gap-2.5 sm:grid-cols-2">
                {browse.map((s) => (
                  <ServiceRow key={s.id} service={s} onOpen={() => onOpenService(s)} />
                ))}
              </div>
              {hasMore && (
                <div className="mt-4 flex justify-center">
                  <Button variant="outline" onClick={() => loadMoreServices()}>
                    Load more services
                  </Button>
                </div>
              )}
            </section>
          </>
        )}

        {/* disclaimer footer */}
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">{DISCLAIMER}</p>
      </div>
    </div>
  );
}

function SectionHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-base font-bold text-foreground">{title}</h3>
      {action}
    </div>
  );
}

function TrustItem({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center sm:flex-row sm:items-center sm:gap-2.5 sm:text-left">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold text-white">{title}</span>
        <span className="block text-[10px] leading-tight text-white/70">{sub}</span>
      </span>
    </div>
  );
}

function Rail({
  title,
  icon,
  services,
  onOpenService,
}: {
  title: string;
  icon?: React.ReactNode;
  services: Service[];
  onOpenService: (s: Service) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-1.5">
        {icon}
        <h3 className="text-base font-bold text-foreground">{title}</h3>
      </div>
      <div className="ps-no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
        {services.map((s) => (
          <ServiceCard
            key={s.id}
            service={s}
            onOpen={() => onOpenService(s)}
            className="w-40 shrink-0 sm:w-44"
          />
        ))}
      </div>
    </section>
  );
}
