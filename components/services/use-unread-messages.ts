"use client";

import { useCallback, useEffect, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { backendApi } from "@/lib/backend-api";

const POLL_MS = 30_000;

/**
 * Polls `/api/messages/unread` for the caller and exposes the counts.
 *
 * The server has no realtime broadcaster yet (see MESSAGING-PLAN.md), so this
 * is the reliable way to keep the Messages badge current: a 30-second poll plus
 * a refresh whenever the app becomes visible or the window regains focus.
 */
export function useUnreadMessages() {
  const { accessToken } = usePiAuth();
  const [byRequest, setByRequest] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setByRequest({});
      setTotal(0);
      return;
    }
    try {
      const res = await backendApi.messages.unread(accessToken);
      setByRequest(res.byRequest ?? {});
      setTotal(res.total ?? 0);
    } catch (err) {
      console.error("[Messages] unread refresh failed:", err);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, [accessToken, refresh]);

  return { byRequest, total, refresh };
}