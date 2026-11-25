"use client";
import React, { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { usePiAuth } from "./pi-auth-context";

// Re-exported so consumers can type channels without importing the Supabase
// package themselves (which would pull it into their own chunk).
export type RealtimeClient = SupabaseClient;
export type RealtimeChannel = ReturnType<SupabaseClient["channel"]>;

// `undefined` means "no provider above me" (a programmer error); `null` means
// "provider present, client still loading". Conflating the two would hide the
// missing-provider bug.
const RealtimeClientContext = createContext<SupabaseClient | null | undefined>(undefined);

export function RealtimeClientProvider({ children }: { children: ReactNode }) {
  const { realtimeToken } = usePiAuth();
  const tokenRef = useRef<string | null>(realtimeToken);

  useEffect(() => {
    tokenRef.current = realtimeToken;
  }, [realtimeToken]);

  // The Supabase client is ~60 KB of JavaScript that only powers background
  // live updates (message and request feeds). Nothing on the first screen
  // depends on it, so it is imported after mount and the subscriptions start
  // as soon as it resolves — rather than shipping it in the first-load bundle.
  const [client, setClient] = useState<SupabaseClient | null>(null);
  useEffect(() => {
    // Wait for a realtime token before exposing the client: subscribers create
    // their channels the moment the client appears, and a private channel that
    // connects before authorization fails permanently (it does not retry).
    if (!realtimeToken || client) return;
    let cancelled = false;
    import("@/lib/supabase-browser")
      .then(async ({ createRealtimeSupabaseClient }) => {
        const next = createRealtimeSupabaseClient(async () => tokenRef.current);
        // Authorize the socket BEFORE any subscription is created. The client's
        // `accessToken` option alone does NOT authorize Realtime channels —
        // without this call every `config.private: true` channel fails to
        // subscribe (verified end-to-end), which is why live updates were dead.
        try {
          await next.realtime.setAuth(realtimeToken);
        } catch (err) {
          console.error("[Realtime] setAuth failed:", err);
        }
        if (!cancelled) setClient(next);
      })
      .catch((err) => {
        console.error("[Realtime] failed to load realtime client:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [realtimeToken, client]);

  // Re-authorize whenever the short-lived token is refreshed (~every 8 min).
  // Without this the socket would be deauthorized the moment the first token
  // expires and private channels would silently stop delivering.
  useEffect(() => {
    if (!client || !realtimeToken) return;
    void (async () => {
      try {
        await client.realtime.setAuth(realtimeToken);
      } catch (err) {
        console.error("[Realtime] token refresh setAuth failed:", err);
      }
    })();
  }, [client, realtimeToken]);

  return (
    <RealtimeClientContext.Provider value={client}>
      {children}
    </RealtimeClientContext.Provider>
  );
}

/**
 * Returns the realtime client, or null while the lazily imported one is still
 * loading. Subscriptions should no-op on null and be re-run once it arrives,
 * which is why `realtimeClient` belongs in the effect dependency list.
 */
export function useRealtimeClient(): SupabaseClient | null {
  const ctx = useContext(RealtimeClientContext);
  if (ctx === undefined) throw new Error("useRealtimeClient must be used within RealtimeClientProvider");
  return ctx;
}
