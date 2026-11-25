"use client";

import { useId } from "react";
import { APP_NAME, APP_TAGLINE } from "@/lib/services/data";
import { cx } from "./services/ui";

/**
 * The Talse brand mark: a bold "T" monogram whose bar and stem meet like an
 * exchange joint, a gold spark for opportunity, and a small chevron at the base
 * for "hire / sell". It lives on a self-contained purple gradient tile, so it
 * reads identically on light, dark and coloured surfaces.
 *
 * One component drives every brand surface (nav, home header, auth + loading
 * screens, admin console) and the favicon/app icons, so the identity can never
 * drift between them. Gradient ids are per-instance so several marks can appear
 * on one page without colliding.
 */
export function BrandMark({
  size = 40,
  rounded = true,
  className,
}: {
  size?: number;
  /** Rounded tile (app UI) or full-bleed square (iOS/OS app icons). */
  rounded?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const bg = `talse-bg-${uid}`;
  const glow = `talse-glow-${uid}`;
  const mark = `talse-mark-${uid}`;
  const gold = `talse-gold-${uid}`;
  const rx = rounded ? 224 : 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      fill="none"
      role="img"
      aria-label={`${APP_NAME} logo`}
      className={className}
    >
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7A3BE0" />
          <stop offset="0.55" stopColor="#5A21B8" />
          <stop offset="1" stopColor="#2B0E5E" />
        </linearGradient>
        <radialGradient id={glow} cx="0.26" cy="0.2" r="0.95">
          <stop offset="0" stopColor="#C4A2FF" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#C4A2FF" stopOpacity="0.08" />
          <stop offset="1" stopColor="#C4A2FF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={mark} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E9D8FF" />
        </linearGradient>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFE9A8" />
          <stop offset="0.5" stopColor="#FFC24B" />
          <stop offset="1" stopColor="#F29A1F" />
        </linearGradient>
      </defs>

      <rect width="1024" height="1024" rx={rx} fill={`url(#${bg})`} />
      <rect width="1024" height="1024" rx={rx} fill={`url(#${glow})`} />

      {/* Monogram: bar + stem meeting as an exchange joint */}
      <rect x="252" y="258" width="520" height="148" rx="74" fill={`url(#${mark})`} />
      <rect x="448" y="354" width="128" height="412" rx="64" fill={`url(#${mark})`} />

      {/* Gold spark */}
      <path
        d="M792 168 L816 222 L870 246 L816 270 L792 324 L768 270 L714 246 L768 222 Z"
        fill={`url(#${gold})`}
      />

      {/* Exchange chevron at the base of the stem */}
      <path
        d="M470 792 l42 44 42 -44"
        fill="none"
        stroke={`url(#${gold})`}
        strokeWidth="26"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />
    </svg>
  );
}

/**
 * Mark + wordmark (and optional tagline). The wordmark uses design tokens so it
 * follows the theme automatically; the mark is self-contained.
 */
export function BrandLockup({
  size = 36,
  showTagline = false,
  className,
}: {
  size?: number;
  showTagline?: boolean;
  className?: string;
}) {
  return (
    <span className={cx("flex items-center gap-2.5", className)}>
      <BrandMark size={size} className="shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-lg font-bold leading-tight text-foreground">{APP_NAME}</span>
        {showTagline && (
          <span className="truncate text-xs font-medium text-muted-foreground">{APP_TAGLINE}</span>
        )}
      </span>
    </span>
  );
}
