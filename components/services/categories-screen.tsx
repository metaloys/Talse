"use client";

import { CATEGORIES, type CategoryId } from "@/lib/services/data";
import { useServices } from "@/contexts/services-context";
import { cx } from "./ui";
import { CategoryIcon, IconChevronRight } from "./icons";

export function CategoriesScreen({
  onOpenCategory,
}: {
  onOpenCategory: (c: CategoryId) => void;
}) {
  const { allServices } = useServices();

  const countFor = (id: CategoryId) => allServices.filter((s) => s.category === id).length;

  return (
    <div className="mx-auto max-w-md pb-24">
      <div className="ps-hero-grad px-4 pb-5 pt-4 ps-safe-top">
        <h1 className="text-2xl font-bold text-foreground">Categories</h1>
        <p className="mt-1 text-sm text-muted-foreground">Explore services grouped by what you need.</p>
      </div>

      <div className="space-y-2.5 px-4 pt-4">
        {CATEGORIES.map((c) => {
          const count = countFor(c.id);
          return (
            <button
              key={c.id}
              onClick={() => onOpenCategory(c.id)}
              className="ps-press flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left"
            >
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: `oklch(0.95 0.05 ${c.hue})`,
                  color: `oklch(0.45 0.16 ${c.hue})`,
                }}
              >
                <CategoryIcon id={c.id} size={24} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-foreground">{c.label}</h2>
                <p className="ps-clamp-1 text-xs text-muted-foreground">{c.blurb}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-xs font-semibold text-muted-foreground ps-nums">{count}</span>
                <IconChevronRight size={18} className="text-muted-foreground" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
