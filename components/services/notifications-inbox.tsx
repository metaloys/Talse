"use client";

import { useCallback, useEffect, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { useRealtimeClient } from "@/contexts/realtime-client-context";
import { backendApi } from "@/lib/backend-api";
import { Overlay } from "./feedback";
import { EmptyState } from "./ui";
import { IconCheckCircle, IconInbox } from "./icons";

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

  return { items, unread, load, markAllSeen };
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
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  items: Notice[];
  onNavigate?: (subroute: string) => void;
}) {
  const handleTap = (n: Notice) => {
    onClose();
    if (onNavigate) onNavigate(n.subroute);
  };

  return (
    <Overlay open={open} onClose={onClose} title="Notifications">
      <div className="mx-auto max-w-md p-4 pb-10">
        {items.length === 0 ? (
          <EmptyState
            icon={<IconInbox size={26} />}
            title="No notifications yet"
            message="Updates about your requests, offers, messages and payouts will appear here."
          />
        ) : (
          <ul className="space-y-2">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleTap(n)}
                  className="w-full rounded-2xl border border-border bg-card p-3.5 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">
                      <IconCheckCircle size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{n.title}</p>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                    </div>
                    {!n.seen_at && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Overlay>
  );
}