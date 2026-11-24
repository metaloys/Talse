"use client";

import { useState } from "react";
import { useServices } from "@/contexts/services-context";
import { shareLink } from "@/lib/pi-native";
import { Button, cx, IconButton } from "./ui";
import { IconShare } from "./icons";

type Variant = "primary" | "accent" | "outline" | "ghost" | "soft" | "danger" | "success";
type Size = "sm" | "md" | "lg";

/**
 * Shares an in-app path (a listing or a provider) using Pi's native share
 * dialog where available, and tells the user what actually happened: many
 * webviews have no share sheet, in which case the link is copied instead.
 */
export function ShareButton({
  title,
  text,
  path,
  label = "Share",
  iconOnly = false,
  variant = "outline",
  size = "sm",
  className,
}: {
  title: string;
  text: string;
  path: string;
  label?: string;
  iconOnly?: boolean;
  variant?: Variant;
  size?: Size;
  className?: string;
}) {
  const { pushToast } = useServices();
  const [busy, setBusy] = useState(false);

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await shareLink({ title, text, path });
      if (outcome === "shared") pushToast("Shared", "success");
      else if (outcome === "copied") pushToast("Link copied — paste it anywhere", "info");
      else if (outcome === "unavailable") pushToast("Sharing isn't available in this browser", "warning");
    } finally {
      setBusy(false);
    }
  };

  if (iconOnly) {
    return (
      <IconButton
        label={label}
        onClick={share}
        disabled={busy}
        className={cx(
          "h-9 w-9 border border-border bg-card/95 text-foreground shadow-sm backdrop-blur",
          className,
        )}
      >
        <IconShare size={17} />
      </IconButton>
    );
  }

  return (
    <Button variant={variant} size={size} className={className} onClick={share} disabled={busy}>
      <IconShare size={16} />
      {busy ? "Sharing…" : label}
    </Button>
  );
}