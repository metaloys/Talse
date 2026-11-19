"use client";

import { useEffect, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { useServices } from "@/contexts/services-context";
import { Button, cx, Field, TextArea } from "./ui";
import { IconFlag } from "./icons";

type ReportTarget = "service" | "user" | "review";

const REASONS: Record<ReportTarget, string[]> = {
  service: [
    "Scam or fraud",
    "Misleading or inaccurate",
    "Prohibited or illegal",
    "Duplicate listing",
    "Something else",
  ],
  user: [
    "Scam or fraud",
    "Harassment or abuse",
    "Impersonation",
    "Did not deliver after payment",
    "Something else",
  ],
  review: ["Abusive language", "Not a real transaction", "Spam", "Something else"],
};

const DETAILS_MAX = 600;

export function ReportSheet({
  open,
  onClose,
  targetType,
  targetId,
  targetLabel,
}: {
  open: boolean;
  onClose: () => void;
  targetType: ReportTarget;
  targetId: string;
  targetLabel?: string;
}) {
  const { accessToken } = usePiAuth();
  const { pushToast } = useServices();
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setDetails("");
    setError(null);
    setBusy(false);
  }, [open, targetId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async () => {
    if (!reason) {
      setError("Choose what is wrong with this listing.");
      return;
    }
    if (!accessToken) {
      setError("You need to be signed in with Pi to report something.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId,
          reason,
          details: details.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data?.error === "string" ? data.error : "Could not send the report.");
      }
      pushToast("Report sent. Our team will review it.", "success");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the report.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[78] flex items-end justify-center bg-black/40 ps-anim-fade-in"
      onClick={() => (busy ? undefined : onClose())}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Report this listing"
        className="ps-anim-slide-up w-full max-w-md rounded-t-3xl bg-card p-5 ps-safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive-soft text-destructive">
            <IconFlag size={17} />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-foreground">Report this {targetType}</h3>
            {targetLabel && <p className="ps-clamp-1 text-xs text-muted-foreground">{targetLabel}</p>}
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Reports go to the {targetType === "user" ? "marketplace" : "listing"} review queue. Only you and our team can
          see who filed it.
        </p>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Reason">
          {REASONS[targetType].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setReason(r);
                setError(null);
              }}
              aria-pressed={reason === r}
              className={cx(
                "ps-press rounded-full border px-3 py-1.5 text-xs font-semibold",
                reason === r
                  ? "border-destructive bg-destructive-soft text-destructive"
                  : "border-border bg-card text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <Field label="What happened? (optional)" counter={`${details.length}/${DETAILS_MAX}`}>
            <TextArea
              rows={3}
              maxLength={DETAILS_MAX}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Add anything that helps us check this quickly."
            />
          </Field>
        </div>

        {error && <p className="mt-3 text-xs font-medium text-destructive">{error}</p>}

        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={() => void submit()} disabled={busy || !reason}>
            {busy ? "Sending…" : "Send report"}
          </Button>
        </div>
      </div>
    </div>
  );
}
