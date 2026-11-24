"use client";

import { IconBell } from "./icons";
import { cx, IconButton } from "./ui";

/**
 * Top-bar notification entry point.
 *
 * Lives in each tab's header (top-right) rather than as an extra bottom-nav
 * tab, so the primary navigation stays at five destinations and alerts read
 * the way they do in other Pi apps. The badge shows the unread count from
 * `useNotifications()`.
 */
export function NotificationBell({
  unread = 0,
  onClick,
  className,
}: {
  unread?: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <IconButton
      label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      onClick={onClick}
      className={cx("relative h-9 w-9 shrink-0 border border-border bg-card", className)}
    >
      <IconBell className="h-5 w-5" />
      {unread > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </IconButton>
  );
}