"use client";
import React, { createContext, useContext, useEffect, useRef, useMemo, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRealtimeSupabaseClient } from "@/lib/supabase-browser";
import { usePiAuth } from "./pi-auth-context";

const RealtimeClientContext = createContext<SupabaseClient | null>(null);

export function RealtimeClientProvider({ children }: { children: ReactNode }) {
  const { realtimeToken } = usePiAuth();
  const tokenRef = useRef<string | null>(realtimeToken);

  useEffect(() => {
    tokenRef.current = realtimeToken;
  }, [realtimeToken]);

  const client = useMemo(
    () => createRealtimeSupabaseClient(async () => tokenRef.current),
    []
  );

  return (
    <RealtimeClientContext.Provider value={client}>
      {children}
    </RealtimeClientContext.Provider>
  );
}

export function useRealtimeClient() {
  const ctx = useContext(RealtimeClientContext);
  if (!ctx) throw new Error("useRealtimeClient must be used within RealtimeClientProvider");
  return ctx;
}
