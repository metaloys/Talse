"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { useRealtimeClient } from "@/contexts/realtime-client-context";
import { backendApi } from "@/lib/backend-api";
import { Overlay } from "./feedback";
import { cx, EmptyState } from "./ui";
import {
  IconBolt,
  IconCalendar,
  IconInbox,
  IconSend,
  IconShield,
  IconStar,
  IconUser,
  IconWallet,
} from "./icons";

export type Notice = {
  id: string;
  title: string;
  body: string;
  subroute: string;
  kind: string;
  related_id: string | null;
  seen_at: string | null;
  created_at: string;
};

const POLL_MS = 45_000;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

type NoticeTone = "primary" | "accent" | "success" | "warning" | "danger";

const TONE_TILE: Record<NoticeTone, string> = {
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning-foreground",
  danger: "bg-destructive-soft text-destructive",
};

/**
 * Notifications only carry a title, body, kind and `subroute`, so the icon and
 * colour are derived from what the notice actually links to. That keeps the
 * inbox scannable without a server-side taxonomy to maintain.
 */
function noticeMeta(n: Notice): { icon: ReactNode; tone: NoticeTone } {
  const route = n.subroute || "";
  const kind = (n.kind || "").toLowerCase();
  if (route.startsWith("/messages") || kind.includes("message")) {
    return { icon: <IconSend size={17} />, tone: "primary" };
  }
  if (kind.includes("payout") || kind.includes("payment") || kind.includes("escrow")) {
    return { icon: <IconWallet size={17} />, tone: "success" };
  }
  if (kind.includes("boost")) {
    return { icon: <IconBolt size={17} />, tone: "accent" };
  }
  if (kind.includes("review")) {
    return { icon: <IconStar size={17} />, tone: "warning" };
  }
  if (kind.includes("dispute")) {
    return { icon: <IconShield size={17} />, tone: "danger" };
  }
  if (kind.includes("offer") || kind.includes("request") || route.startsWith("/hire-requests")) {
    return { icon: <IconCalendar size={17} />, tone: "primary" };
  }
  if (route.startsWith("/providers") || kind.includes("user")) {
    return { icon: <IconUser size={17} />, tone: "accent" };
  }
  return { icon: <IconInbox size={17} />, tone: "primary" };
}

/**
 * Loads the caller's in-app notifications from `/api/notifications`.
 *
 * This is the Talse-side surface for the `notifications` table written by
 * `notifyUsers()` on the server, so a Pioneer always has an inbox inside the
 * app even when Pi's best-effort Notification Center push is dropped.
 */
export function useNotifications() {
  const { accessToken, piUser } = usePiAuth();
  const realtimeClient = useRealtimeClient();
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await backendApi.notifications.list(accessToken);
      setItems(res.notifications ?? []);
      setUnread(res.unread ?? 0);
    } catch (err) {
      // An inbox fetch is cosmetic; never let it break the app.
      console.error("[Notifications] load failed:", err);
    }
  }, [accessToken]);

  const markAllSeen = useCallback(async () => {
    if (!accessToken) return;
    try {
      await backendApi.notifications.markSeen(accessToken, { all: true });
      const now = new Date().toISOString();
      setUnread(0);
      setItems((prev) => prev.map((n) => (n.seen_at ? n : { ...n, seen_at: now })));
    } catch (err) {
      console.error("[Notifications] mark-seen failed:", err);
    }
  }, [accessToken]);

  const markSeen = useCallback(
    async (ids: string[]) => {
      if (!accessToken || ids.length === 0) return;
      try {
        await backendApi.notifications.markSeen(accessToken, { ids });
        const now = new Date().toISOString();
        setItems((prev) => prev.map((n) => (ids.includes(n.id) && !n.seen_at ? { ...n, seen_at: now } : n)));
        setUnread((u) => Math.max(0, u - ids.length));
      } catch (err) {
        console.error("[Notifications] mark-seen failed:", err);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    if (!accessToken) return;
    void load();
    const timer = setInterval(() => {
      void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [accessToken, load]);

  // Live delivery: the `notifications` insert trigger (migration 015) broadcasts
  // to `user:<uid>:notifications`, so the bell and inbox update immediately
  // instead of waiting up to 45 s for the next poll. The poll stays as a
  // fallback for when Realtime is unavailable.
  useEffect(() => {
    if (!realtimeClient || !piUser?.uid) return;
    const channel = realtimeClient.channel(`user:${piUser.uid}:notifications`, {
      config: { private: true },
    });
    channel.on("broadcast", { event: "notification" }, () => {
      void load();
    });
    channel.subscribe();
    return () => {
      try {
        channel.unsubscribe();
      } catch {
        // channel already gone
      }
    };
  }, [realtimeClient, piUser?.uid, load]);

  return { items, unread, load, markAllSeen, markSeen };
}

/**
 * Presentational notification inbox. Tapping a notice closes the inbox and
 * hands its `subroute` to `onNavigate` so the parent can open the
 * corresponding hire request / service.
 */
export function NotificationInbox({
  open,
  onClose,
  items,
  unread = 0,
  onMarkAllRead,
  onSeen,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  items: Notice[];
  unread?: number;
  onMarkAllRead?: () => void;
  onSeen?: (id: string) => void;
  onNavigate?: (subroute: string) => void;
}) {
  const handleTap = (n: Notice) => {
    if (!n.seen_at) onSeen?.(n.id);
    onClose();
    if (n.subroute && onNavigate) onNavigate(n.subroute);
  };

  return (
    <Overlay
      open={open}
      onClose={onClose}
      title="Notifications"
      headerRight={
        unread > 0 && onMarkAllRead ? (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="ps-press shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-primary"
          >
            Mark all read
          </button>
        ) : null
      }
    >
      <div className="mx-auto max-w-2xl p-4 pb-10">
        {items.length === 0 ? (
          <EmptyState
            icon={<IconInbox size={26} />}
            title="No notifications yet"
            message="Updates about your requests, offers, messages and payouts will appear here."
          />
        ) : (
          <>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {unread > 0 ? `${unread} unread` : "You're all caught up"}
            </p>
            <ul className="space-y-2">
              {items.map((n) => {
                const meta = noticeMeta(n);
                const isUnread = !n.seen_at;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleTap(n)}
                      className={cx(
                        "flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors",
                        isUnread
                          ? "border-primary/25 bg-primary-soft/30 hover:bg-primary-soft/50"
                          : "border-border bg-card hover:bg-muted/40",
                      )}
                    >
                      <span
                        className={cx(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                          TONE_TILE[meta.tone],
                        )}
                      >
                        {meta.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">{n.title}</p>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                        </div>
                        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{n.body}</p>
                      </div>
                      {isUnread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Overlay>
  );
}
