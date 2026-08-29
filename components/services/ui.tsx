"use client";

import React, { type ReactNode, type TextareaHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { IconInbox, IconMinus, IconPlus } from "./icons";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ---- Button ----
type ButtonVariant = "primary" | "accent" | "outline" | "ghost" | "soft" | "danger" | "success";
type ButtonSize = "sm" | "md" | "lg";

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  accent: "bg-accent text-accent-foreground hover:opacity-90",
  outline: "border border-border bg-card text-foreground hover:bg-secondary",
  ghost: "text-foreground hover:bg-secondary",
  soft: "bg-primary-soft text-primary hover:opacity-85",
  danger: "bg-destructive text-destructive-foreground hover:opacity-90",
  success: "bg-success text-success-foreground hover:opacity-90",
};

const BTN_SIZE: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm rounded-lg gap-1.5",
  md: "h-11 px-4 text-sm rounded-xl gap-2",
  lg: "h-12 px-5 text-base rounded-xl gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cx(
        "ps-press inline-flex items-center justify-center font-semibold disabled:opacity-50 disabled:pointer-events-none",
        BTN_VARIANT[variant],
        BTN_SIZE[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  className,
  children,
  label,
  ...props
}: { label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={label}
      className={cx(
        "ps-press inline-flex items-center justify-center rounded-full text-foreground hover:bg-secondary disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ---- Card ----
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("rounded-2xl border border-border bg-card", className)}
      {...props}
    >
      {children}
    </div>
  );
}

// ---- SectionTitle ----
export function SectionTitle({
  title,
  action,
  className,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-center justify-between gap-3", className)}>
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      {action}
    </div>
  );
}

// ---- Pill ----
type PillTone = "neutral" | "primary" | "accent" | "success" | "warning" | "danger";
const PILL_TONE: Record<PillTone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning-foreground",
  danger: "bg-destructive-soft text-destructive",
};

export function Pill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: PillTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        PILL_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---- inputs ----
export const inputClass =
  "w-full rounded-xl border border-input bg-card px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 transition";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputClass, props.className)} {...props} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputClass, "resize-none leading-relaxed", props.className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputClass, "appearance-none pr-9", className)} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  counter,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
  counter?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-semibold text-foreground">
          {label}
        </label>
        {counter && <span className="text-xs text-muted-foreground ps-nums">{counter}</span>}
      </div>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

// ---- Stepper ----
export function Stepper({
  value,
  min = 0,
  max = 99,
  onChange,
  label,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1">
      <IconButton
        label={`decrease ${label}`}
        className="h-8 w-8 disabled:opacity-40"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <IconMinus size={16} />
      </IconButton>
      <span className="min-w-8 text-center text-sm font-bold ps-nums">{value}</span>
      <IconButton
        label={`increase ${label}`}
        className="h-8 w-8 disabled:opacity-40"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <IconPlus size={16} />
      </IconButton>
    </div>
  );
}

// ---- Avatar ----
export function Avatar({
  name,
  hue,
  size = 44,
  className,
}: {
  name: string;
  hue: number;
  size?: number;
  className?: string;
}) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const label =
    parts.length === 0
      ? "PS"
      : parts.length === 1
        ? parts[0].slice(0, 2).toUpperCase()
        : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (
    <div
      className={cx("flex items-center justify-center rounded-full font-bold text-white shrink-0", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, oklch(0.6 0.16 ${hue}), oklch(0.48 0.18 ${(hue + 40) % 360}))`,
      }}
      aria-hidden="true"
    >
      {label}
    </div>
  );
}

// ---- EmptyState ----
export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
        {icon ?? <IconInbox size={26} />}
      </div>
      <h3 className="text-base font-bold text-foreground">{title}</h3>
      {message && <p className="mt-1 max-w-xs text-sm text-muted-foreground">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---- Toggle ----
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "ps-press relative h-7 w-12 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-border",
      )}
    >
      <span
        className={cx(
          "absolute top-1 h-5 w-5 rounded-full bg-white transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
