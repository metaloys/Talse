"use client";

import type { ReactNode } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { APP_NAME } from "@/lib/services/data";
import { Button } from "./ui";
import { IconShield, IconUser } from "./icons";

/**
 * In-tab sign-in prompt shown to guests inside account-gated areas (Activity,
 * Messages, Profile, ...). Keep browsing is implicit: the prompt itself sits
 * inside the live app, so the visitor is one tap away from the public feed.
 */
export function SignInPrompt({ title }: { title?: string }) {
  const { signIn } = usePiAuth();

  return (
    <div className="mx-auto flex min-h-[55vh] w-full max-w-md flex-col items-center justify-center gap-4 px-6 py-14 text-center">
      <span className="ps-anim-pop flex h-16 w-16 items-center justify-center rounded-3xl bg-primary-soft text-primary shadow-sm">
        <IconUser size={30} />
      </span>
      <div className="space-y-1.5">
        <h2 className="text-lg font-bold text-foreground">{title ?? "Sign in to continue"}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your account powers hiring, messages, activity and profile on {APP_NAME}. Browsing the catalogue and shared
          listings stays free — no sign-in needed.
        </p>
      </div>
      <Button size="lg" className="w-full max-w-[260px]" onClick={() => void signIn()}>
        Sign in with Pi
      </Button>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <IconShield size={12} />
        Your Pi access token is verified by Pi&apos;s servers — we never store it.
      </p>
    </div>
  );
}

/**
 * Renders `children` only while authenticated, otherwise the sign-in prompt.
 * Use it to wrap account-gated screens so a guest who lands on them (including
 * via a deep link) sees a clean sign-in CTA instead of an empty or broken view.
 */
export function RequireAuth({ children, title }: { children: ReactNode; title?: string }) {
  const { isAuthenticated } = usePiAuth();
  if (isAuthenticated) return <>{children}</>;
  return <SignInPrompt title={title} />;
}