"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CATEGORIES,
  DELIVERY_OPTIONS,
  PRICE_BANDS,
  SORTS,
  deliveryDays,
  inPriceBand,
  matchesQuery,
  type CategoryId,
  type PriceBandId,
  type Service,
  type SortId,
} from "@/lib/services/data";
import { useServices } from "@/contexts/services-context";
import { Button, cx, EmptyState, IconButton } from "./ui";
import { CategoryIcon, IconClose, IconInbox, IconSearch, IconSliders } from "./icons";
import { ServiceCard } from "./service-card";

export function SearchScreen({
  presetCategory,
  presetNonce,
  onOpenService,
}: {
  presetCategory: CategoryId | "all";
  presetNonce: number;
  onOpenService: (s: Service) => void;
}) {
  const { allServices } = useServices();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryId | "all">("all");
  const [band, setBand] = useState<PriceBandId>("any");
  const [delivery, setDelivery] = useState<"any" | number>("any");
  const [sort, setSort] = useState<SortId>("recent");
  const [showFilters, setShowFilters] = useState(false);

  // apply preset from parent (category tap / see all)
  useEffect(() => {
    setCategory(presetCategory);
    setQuery("");
    setBand("any");
    setDelivery("any");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetNonce]);

  const activeFilters =
    (category !== "all" ? 1 : 0) + (band !== "any" ? 1 : 0) + (delivery !== "any" ? 1 : 0);

  const results = useMemo(() => {
    let list = allServices.filter((s) => matchesQuery(s, query));
    if (category !== "all") list = list.filter((s) => s.category === category);
    if (band !== "any") list = list.filter((s) => inPriceBand(s.price, band));
    if (delivery !== "any") list = list.filter((s) => deliveryDays(s.deliveryId) <= delivery);

    const sorted = [...list];
    if (sort === "price-asc") sorted.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") sorted.sort((a, b) => b.price - a.price);
    else if (sort === "fastest") sorted.sort((a, b) => deliveryDays(a.deliveryId) - deliveryDays(b.deliveryId));
    else sorted.sort((a, b) => b.createdAt - a.createdAt);
    return sorted;
  }, [allServices, query, category, band, delivery, sort]);

  const clearFilters = () => {
    setCategory("all");
    setBand("any");
    setDelivery("any");
  };

  return (
    <div className="mx-auto max-w-md pb-24">
      <div className="ps-hero-grad px-4 pb-4 pt-4 ps-safe-top">
        <h1 className="text-2xl font-bold text-foreground">Find services</h1>
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <IconSearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles & descriptions…"
              enterKeyHint="search"
              className="h-11 w-full rounded-xl border border-input bg-card pl-10 pr-9 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            {query && (
              <IconButton
                label="Clear search"
                className="absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground"
                onClick={() => setQuery("")}
              >
                <IconClose size={16} />
              </IconButton>
            )}
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={cx(
              "ps-press relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
              showFilters || activeFilters > 0
                ? "border-primary bg-primary-soft text-primary"
                : "border-border bg-card text-foreground",
            )}
            aria-label="Filters"
          >
            <IconSliders size={20} />
            {activeFilters > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {activeFilters}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* filter panel */}
      {showFilters && (
        <div className="ps-anim-fade-in space-y-4 border-b border-border bg-card px-4 py-4">
          <FilterGroup label="Category">
            <Chip active={category === "all"} onClick={() => setCategory("all")}>
              All
            </Chip>
            {CATEGORIES.map((c) => (
              <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
                <CategoryIcon id={c.id} size={13} />
                {c.short}
              </Chip>
            ))}
          </FilterGroup>

          <FilterGroup label="Price">
            {PRICE_BANDS.map((b) => (
              <Chip key={b.id} active={band === b.id} onClick={() => setBand(b.id)}>
                {b.label}
              </Chip>
            ))}
          </FilterGroup>

          <FilterGroup label="Delivery within">
            <Chip active={delivery === "any"} onClick={() => setDelivery("any")}>
              Any
            </Chip>
            {DELIVERY_OPTIONS.map((d) => (
              <Chip key={d.id} active={delivery === d.days} onClick={() => setDelivery(d.days)}>
                {d.label}
              </Chip>
            ))}
          </FilterGroup>

          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      <div className="px-4 pt-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {results.length} {results.length === 1 ? "service" : "services"}
          </p>
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortId)}
              className="h-9 appearance-none rounded-lg border border-border bg-card pl-3 pr-8 text-xs font-semibold text-foreground outline-none focus:border-primary"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {results.length === 0 ? (
          <EmptyState
            icon={<IconInbox size={26} />}
            title="No services found"
            message="Try a different keyword or adjust your filters."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {results.map((s) => (
              <ServiceCard key={s.id} service={s} onOpen={() => onOpenService(s)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "ps-press inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground",
      )}
    >
      {children}
    </button>
  );
}
