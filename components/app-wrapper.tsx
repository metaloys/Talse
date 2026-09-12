"use client";

import type { ReactNode } from "react";
import { PiAuthProvider, usePiAuth } from "@/contexts/pi-auth-context";
import { RealtimeClientProvider } from "@/contexts/realtime-client-context";
import DevTokenPanel from "@/components/dev/token-panel";
import { AuthLoadingScreen } from "./auth-loading-screen";

function AppContent({ children }: { children: ReactNode }) {
  const { isAuthenticated } = usePiAuth();
  if (!isAuthenticated) return <AuthLoadingScreen />;
  return <>{children}</>;
}

export function AppWrapper({ children }: { children: ReactNode }) {
  return (
    <PiAuthProvider>
      <RealtimeClientProvider>
        <AppContent>{children}</AppContent>
        {/* Mount dev-only token panel; component itself double-checks NODE_ENV. */}
        {process.env.NODE_ENV !== "production" ? <DevTokenPanel /> : null}
      </RealtimeClientProvider>
    </PiAuthProvider>
  );
}
