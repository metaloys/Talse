"use client"

import type { ReactElement } from "react"
import type { TabId } from "@/lib/services/data"
import { IconHome, IconInbox, IconSearch, IconActivity, IconUser } from "./icons"
import { cx } from "./ui"

export type NavItem = { id: TabId; label: string; icon: ReactElement }

/** Shared by the mobile bottom nav and the desktop top nav. */
export const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: <IconHome className="h-5 w-5" /> },
  { id: "search", label: "Search", icon: <IconSearch className="h-5 w-5" /> },
  { id: "activity", label: "Activity", icon: <IconActivity className="h-5 w-5" /> },
  { id: "messages", label: "Messages", icon: <IconInbox className="h-5 w-5" /> },
  { id: "profile", label: "Profile", icon: <IconUser className="h-5 w-5" /> },
]

export function badgeFor(
  id: TabId,
  activityCount: number,
  messagesUnreadCount: number,
): number {
  if (id === "activity") return activityCount
  if (id === "messages") return messagesUnreadCount
  return 0
}

/**
 * Mobile-only bottom navigation. On desktop the app uses `TopNav` instead, so
 * this bar is hidden from `lg` up.
 */
export function BottomNav({
  active,
  onChange,
  activityCount,
  messagesUnreadCount = 0,
}: {
  active: TabId
  onChange: (t: TabId) => void
  activityCount: number
  messagesUnreadCount?: number
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur ps-safe-bottom lg:hidden">
      <ul className="mx-auto flex max-w-md items-stretch">
        {NAV_ITEMS.map((t) => {
          const isActive = active === t.id
          const badgeCount = badgeFor(t.id, activityCount, messagesUnreadCount)
          const showBadge = badgeCount > 0
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
                      {badgeCount > 9 ? "9+" : badgeCount}
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
