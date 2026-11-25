"use client";

import type { ReactNode } from "react";
import { PiAuthProvider, usePiAuth } from "@/contexts/pi-auth-context";
import { RealtimeClientProvider } from "@/contexts/realtime-client-context";
import DevTokenPanel from "@/components/dev/token-panel";
import { AuthLoadingScreen } from "./auth-loading-screen";

// Phase 1 guest mode: there is no global auth gate anymore. Every route renders
// immediately (the catalogue, share links and provider profiles are public),
// and Pi.authenticate only runs when a visitor takes an account-gated action.
// While that explicit attempt is in flight — or has just failed — the auth
// screen is layered over the app instead of replacing it, so browse state
// (open listing, current tab, pending deep link) survives the handshake.
function AppContent({ children }: { children: ReactNode }) {
  const { signingIn, hasError } = usePiAuth();
  if (signingIn || hasError) {
    return (
      <>
        {children}
        <div className="fixed inset-0 z-[95] overflow-hidden bg-background">
          <AuthLoadingScreen />
        </div>
      </>
    );
  }
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