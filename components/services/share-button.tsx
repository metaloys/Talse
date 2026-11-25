"use client";

import { useEffect, useState } from "react";
import { useServices } from "@/contexts/services-context";
import { absoluteUrl, copyToClipboard, nativeShareProvider, shareNatively } from "@/lib/pi-native";
import { Button, cx, IconButton } from "./ui";
import { IconCheckCircle, IconShare } from "./icons";

type Variant = "primary" | "accent" | "outline" | "ghost" | "soft" | "danger" | "success";
type Size = "sm" | "md" | "lg";

/**
 * Shares an in-app path (a listing, provider or receipt).
 *
 * Tapping it opens a small sheet that always shows the link with a Copy button,
 * plus the platform share sheet when one exists. We deliberately do NOT share
 * silently: several Pi Browser builds (notably the sandbox) expose
 * `Pi.openShareDialog` as a no-op that resolves immediately, so a "Shared" toast
 * with no visible result previously left the user with nothing to send.
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
  const [open, setOpen] = useState(false);

  return (
    <>
      {iconOnly ? (
        <IconButton
          label={label}
          onClick={() => setOpen(true)}
          className={cx(
            "h-9 w-9 border border-border bg-card/95 text-foreground shadow-sm backdrop-blur",
            className,
          )}
        >
          <IconShare size={17} />
        </IconButton>
      ) : (
        <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
          <IconShare size={16} />
          {label}
        </Button>
      )}
      <ShareSheet
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        text={text}
        path={path}
      />
    </>
  );
}

function ShareSheet({
  open,
  onClose,
  title,
  text,
  path,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  text: string;
  path: string;
}) {
  const { pushToast } = useServices();
  const [provider, setProvider] = useState<"pi" | "web" | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset per-open state and detect the native surface on the client.
  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setBusy(false);
    setProvider(nativeShareProvider());
  }, [open]);

  if (!open) return null;

  // Safe to compute here: the sheet only renders on the client after a tap.
  const url = absoluteUrl(path);

  const copy = async () => {
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      pushToast("Link copied — paste it anywhere", "info");
    } else {
      pushToast("Couldn't copy automatically — select the link and copy it", "warning");
    }
  };

  const native = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await shareNatively({ title, text, path });
      if (outcome === "shared") {
        pushToast("Shared", "success");
        onClose();
      } else if (outcome === "unavailable") {
        pushToast("Sharing isn't available here — copy the link instead", "warning");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end justify-center bg-black/40 ps-anim-fade-in"
      onClick={onClose}
    >
      <div
        className="ps-anim-slide-up w-full max-w-md rounded-t-3xl bg-card p-5 ps-safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
        <h3 className="ps-clamp-2 text-lg font-bold text-foreground">Share “{title}”</h3>
        <p className="ps-clamp-2 mt-1 text-sm text-muted-foreground">{text}</p>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-secondary/60 p-1.5 pl-3">
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{url}</span>
          <button
            onClick={copy}
            className={cx(
              "ps-press inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-xs font-bold",
              copied ? "bg-success text-success-foreground" : "bg-primary text-primary-foreground",
            )}
          >
            {copied ? (
              <>
                <IconCheckCircle size={14} />
                Copied
              </>
            ) : (
              "Copy link"
            )}
          </button>
        </div>

        {provider && (
          <Button className="mt-3 w-full" onClick={native} disabled={busy}>
            <IconShare size={16} />
            {busy ? "Sharing..." : provider === "pi" ? "Share with Pi" : "Share…"}
          </Button>
        )}
        <Button variant="ghost" className="mt-2 w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
