"use client";

import { usePiAuth } from "@/contexts/pi-auth-context";
import { APP_NAME, APP_TAGLINE } from "@/lib/services/data";
import { Button } from "@/components/services/ui";
import { IconLogo, IconShield, IconSpinner } from "@/components/services/icons";

/**
 * Auth handshake screen. Since Phase 1 (guest mode) the app no longer gates on
 * this screen; it is shown over the app while an explicit signIn() attempt is
 * in flight, and doubles as the error/retry surface for a failed handshake —
 * the one moment a new user is most likely to bounce, so it stays deliberately
 * calm and on-brand rather than a bare spinner.
 *
 * "Back to browsing" only appears on failure: it calls cancelSignIn() so a
 * visitor who declined the Pi consent (or signed in successfully but later
 * backed out) can keep using the public, account-free parts of the app.
 */
export function AuthLoadingScreen() {
  const { authMessage, hasError, signIn, cancelSignIn } = usePiAuth();

  return (
    <div className="ps-hero-rich flex min-h-screen flex-col items-center justify-center px-6 ps-safe-top ps-safe-bottom">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <div className="ps-anim-pop flex h-20 w-20 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-lg">
          <IconLogo size={40} />
        </div>
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-foreground">{APP_NAME}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{APP_TAGLINE}</p>

        {hasError ? (
          <div className="ps-anim-fade-up mt-8 w-full space-y-4 rounded-2xl border border-destructive/25 bg-card p-5 shadow-sm">
            <div className="flex flex-col items-center gap-2">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive-soft text-destructive">
                <IconShield size={24} />
              </span>
              <h2 className="text-base font-bold text-foreground">Couldn&apos;t sign you in</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{authMessage}</p>
            </div>
            <Button className="w-full" size="lg" onClick={() => void signIn()}>
              Try again
            </Button>
            <Button className="w-full" variant="ghost" size="lg" onClick={cancelSignIn}>
              Back to browsing
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Open {APP_NAME} inside Pi Browser and make sure you&apos;re signed in to Pi, then try again.
            </p>
          </div>
        ) : (
          <div className="mt-8 flex flex-col items-center gap-3">
            <span className="text-primary">
              <IconSpinner size={28} className="ps-anim-spin" />
            </span>
            <p className="text-sm text-muted-foreground">{authMessage || "Signing you in with Pi..."}</p>
          </div>
        )}
      </div>
    </div>
  );
}