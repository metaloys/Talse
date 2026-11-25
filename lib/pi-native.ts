"use client";

/**
 * Pi-native sharing and clipboard helpers, with web fallbacks.
 *
 * Inside Pi Browser we prefer the SDK's own utilities (`Pi.openShareDialog`,
 * `Pi.copyText`) so the experience matches the rest of the Pi app ecosystem.
 * Outside it — or on builds that don't expose them — we fall back to the Web
 * Share API and then the clipboard, so a share button never does nothing.
 *
 * Everything here is client-only and never throws: callers get a small outcome
 * value they can turn into a toast.
 */

export type ShareOutcome = "shared" | "copied" | "cancelled" | "unavailable";

type ShareInput = {
  /** Dialog title — usually the listing or provider name. */
  title: string;
  /** Message shown alongside the link. */
  text: string;
  /** App-relative path, e.g. "/services/abc123". */
  path: string;
};

function piSdk(): Window["Pi"] | null {
  if (typeof window === "undefined") return null;
  return window.Pi ?? null;
}

function isAbort(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { name?: string }).name === "AbortError");
}

/** Turns an app-relative path into an absolute URL the recipient can open. */
export function absoluteUrl(path: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${suffix}`;
}

/**
 * Copy text using Pi's native helper when available, then the async clipboard,
 * then the legacy `execCommand` path for older webviews.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const pi = piSdk();
  if (pi?.copyText) {
    try {
      await pi.copyText(text);
      return true;
    } catch {
      // Fall through to the browser clipboard.
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path.
    }
  }

  if (typeof document === "undefined") return false;
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.top = "-1000px";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Which native share surface is available, if any. `"pi"` is Pi Browser's own
 * dialog; `"web"` is the Web Share API. `null` means the app must show its own
 * sheet (a link the user can copy).
 */
export function nativeShareProvider(): "pi" | "web" | null {
  const pi = piSdk();
  if (pi?.openShareDialog) return "pi";
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") return "web";
  return null;
}

export function canShareNatively(): boolean {
  return nativeShareProvider() !== null;
}

/**
 * Attempt the platform share sheet (Pi, then Web Share).
 *
 * NOTE: a resolved promise is *not* proof the user saw anything — some Pi
 * Browser builds (notably the sandbox) expose `openShareDialog` as a no-op that
 * resolves immediately. Callers must never rely on the "shared" result alone;
 * always surface the link too, so a silent no-op still leaves the user able to
 * share. See `ShareButton`/`ShareSheet`.
 */
export async function shareNatively({ title, text, path }: ShareInput): Promise<ShareOutcome> {
  const url = absoluteUrl(path);
  const pi = piSdk();

  if (pi?.openShareDialog) {
    try {
      // Include the URL in the message: the native dialog shares the app, and
      // the explicit link guarantees a recipient lands on the shared listing.
      await pi.openShareDialog(title, `${text} ${url}`.trim());
      return "shared";
    } catch (err) {
      if (isAbort(err)) return "cancelled";
      // Unsupported in this build — try the web share sheet next.
    }
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (err) {
      if (isAbort(err)) return "cancelled";
    }
  }

  return "unavailable";
}

/**
 * Fire-and-forget share used where a full sheet would be overkill: try the
 * native surface, otherwise copy the link. Prefer `ShareButton` (which shows a
 * copyable link) so a silent native no-op can't leave the user stranded.
 */
export async function shareLink(input: ShareInput): Promise<ShareOutcome> {
  const outcome = await shareNatively(input);
  if (outcome === "shared" || outcome === "cancelled") return outcome;
  const copied = await copyToClipboard(absoluteUrl(input.path));
  return copied ? "copied" : "unavailable";
}