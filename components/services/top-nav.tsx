"use client";

import type { ReactNode } from "react";
import { APP_NAME, type TabId } from "@/lib/services/data";
import { NAV_ITEMS, badgeFor } from "./bottom-nav";
import { Button, cx } from "./ui";
import { IconLogo, IconPlus } from "./icons";

/**
 * Desktop top navigation. Hidden on mobile, where the app keeps its five-tab
 * bottom bar. Both read the same `NAV_ITEMS`, so the two never drift.
 */
export function TopNav({
  active,
  onChange,
  activityCount,
  messagesUnreadCount,
  bell,
  onCreate,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
  activityCount: number;
  messagesUnreadCount: number;
  bell?: ReactNode;
  onCreate: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 hidden border-b border-border bg-card/90 backdrop-blur lg:block">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-6">
        <button
          type="button"
          onClick={() => onChange("home")}
          className="ps-press flex items-center gap-2"
          aria-label={`${APP_NAME} home`}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <IconLogo size={20} />
          </span>
          <span className="text-lg font-bold text-foreground">{APP_NAME}</span>
        </button>

        <nav className="ml-3 flex items-center gap-1" aria-label="Primary">
          {NAV_ITEMS.map((t) => {
            const isActive = active === t.id;
            const badge = badgeFor(t.id, activityCount, messagesUnreadCount);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange(t.id)}
                aria-current={isActive ? "page" : undefined}
                className={cx(
                  "ps-press inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {t.icon}
                {t.label}
                {badge > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={onCreate}>
            <IconPlus size={16} />
            Sell a service
          </Button>
          {bell}
        </div>
      </div>
    </header>
  );
}
