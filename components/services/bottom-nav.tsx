"use client"

import type { ReactElement } from "react"
import type { TabId } from "@/lib/services/data"
import { IconHome, IconGrid, IconSearch, IconActivity, IconUser } from "./icons"
import { cx } from "./ui"

type NavItem = { id: TabId; label: string; icon: ReactElement }

const TABS: NavItem[] = [
  { id: "home", label: "Home", icon: <IconHome className="h-5 w-5" /> },
  { id: "categories", label: "Categories", icon: <IconGrid className="h-5 w-5" /> },
  { id: "search", label: "Search", icon: <IconSearch className="h-5 w-5" /> },
  { id: "activity", label: "Activity", icon: <IconActivity className="h-5 w-5" /> },
  { id: "profile", label: "Profile", icon: <IconUser className="h-5 w-5" /> },
]

export function BottomNav({
  active,
  onChange,
  activityCount,
}: {
  active: TabId
  onChange: (t: TabId) => void
  activityCount: number
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-border bg-card/95 backdrop-blur ps-safe-bottom">
      <ul className="flex items-stretch">
        {TABS.map((t) => {
          const isActive = active === t.id
          const showBadge = t.id === "activity" && activityCount > 0
          return (
            <li key={t.id} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(t.id)}
                aria-current={isActive ? "page" : undefined}
                className={cx(
                  "ps-press relative flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span className="relative">
                  {t.icon}
                  {showBadge ? (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                      {activityCount > 9 ? "9+" : activityCount}
                    </span>
                  ) : null}
                </span>
                <span>{t.label}</span>
                {isActive ? (
                  <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary" />
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
