"use client";

import React, { type ReactNode, useEffect } from "react";
import { APP_NAME, type Toast } from "@/lib/services/data";
import { cx, IconButton } from "./ui";
import {
  IconCheckCircle,
  IconClose,
  IconLogo,
  IconShield,
  IconSpinner,
} from "./icons";

export function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="ps-anim-pop flex h-20 w-20 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-lg">
        <IconLogo size={40} />
      </div>
      <h1 className="mt-5 text-xl font-bold text-foreground">{APP_NAME}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Getting things ready…</p>
      <div className="mt-6 text-primary">
        <IconSpinner size={26} className="ps-anim-spin" />
      </div>
    </div>
  );
}

export function StorageNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[70] flex justify-center px-4 ps-safe-top pointer-events-none">
      <div className="ps-anim-toast-in mt-2 flex items-center gap-2 rounded-full bg-warning-soft px-3.5 py-2 text-xs font-medium text-warning-foreground shadow-sm">
        <IconShield size={15} />
        Saving again — your data is safe.
      </div>
    </div>
  );
}

const TOAST_TONE: Record<Toast["tone"], string> = {
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-destructive text-destructive-foreground",
  info: "bg-foreground text-background",
};

export function ToastHost({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed inset-x-0 top-0 z-[80] flex flex-col items-center gap-2 px-4 ps-safe-top pointer-events-none">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className={cx(
            "ps-anim-toast-in pointer-events-auto mt-2 flex max-w-sm items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold shadow-md",
            TOAST_TONE[t.tone],
          )}
        >
          <IconCheckCircle size={16} />
          <span className="text-left">{t.text}</span>
        </button>
      ))}
    </div>
  );
}

// ---- Full-screen overlay (slide up) ----
export function Overlay({
  open,
  onClose,
  title,
  children,
  headerRight,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  headerRight?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-background ps-anim-slide-up flex flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card/95 px-3 py-3 ps-safe-top backdrop-blur">
        <IconButton label="Close" className="h-10 w-10" onClick={onClose}>
          <IconClose size={22} />
        </IconButton>
        {title && <h2 className="flex-1 truncate text-base font-bold text-foreground">{title}</h2>}
        {headerRight}
      </div>
      <div className="ps-no-scrollbar flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

// confirm dialog
export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/40 ps-anim-fade-in" onClick={onCancel}>
      <div
        className="ps-anim-slide-up w-full max-w-md rounded-t-3xl bg-card p-5 ps-safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-foreground">{title}</h3>
        {message && <p className="mt-1.5 text-sm text-muted-foreground">{message}</p>}
        <div className="mt-5 flex gap-2">
          <button
            onClick={onCancel}
            className="ps-press h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold text-foreground"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={cx(
              "ps-press h-11 flex-1 rounded-xl text-sm font-semibold text-white",
              tone === "danger" ? "bg-destructive" : "bg-primary",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
