"use client";

import { useEffect, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { useServices } from "@/contexts/services-context";
import { Button, cx, Field, TextArea } from "./ui";
import { IconCheck, IconFlag, IconShield } from "./icons";
import { track } from "@/lib/analytics";

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

const NOUN: Record<ReportTarget, string> = {
  service: "listing",
  user: "member",
  review: "review",
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

  const noun = NOUN[targetType];

  const submit = async () => {
    if (!reason) {
      setError(`Choose what is wrong with this ${noun}.`);
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
      track("report_submitted", { target_type: targetType, target_id: targetId, reason });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the report.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[78] flex items-end justify-center bg-black/45 ps-anim-fade-in sm:items-center"
      onClick={() => (busy ? undefined : onClose())}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Report this ${noun}`}
        className="ps-anim-slide-up flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-card shadow-xl sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2.5 border-b border-border px-5 pb-4 pt-5 ps-safe-top">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-destructive-soft text-destructive">
            <IconFlag size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-foreground">Report this {noun}</h3>
            {targetLabel && <p className="ps-clamp-1 text-xs text-muted-foreground">{targetLabel}</p>}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex items-start gap-2 rounded-xl bg-secondary px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
            <IconShield size={15} className="mt-0.5 shrink-0 text-primary" />
            <p>
              Reports are confidential. Only our trust &amp; safety team sees who filed it, and the report is reviewed
              within 24 hours.
            </p>
          </div>

          <Field label="What's wrong?" htmlFor={`report-reason-${targetId}`}>
            <div
              id={`report-reason-${targetId}`}
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              role="group"
              aria-label="Reason"
            >
              {REASONS[targetType].map((r) => {
                const selected = reason === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setReason(r);
                      setError(null);
                    }}
                    aria-pressed={selected}
                    className={cx(
                      "ps-press flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors",
                      selected
                        ? "border-destructive bg-destructive-soft text-destructive"
                        : "border-border bg-card text-foreground hover:bg-muted/50",
                    )}
                  >
                    <span>{r}</span>
                    {selected && <IconCheck size={14} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="What happened? (optional)" counter={`${details.length}/${DETAILS_MAX}`}>
            <TextArea
              rows={3}
              maxLength={DETAILS_MAX}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Add dates, amounts or anything that helps us check this quickly."
            />
          </Field>

          {error && (
            <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-xs font-medium text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-border px-5 py-4 ps-safe-bottom">
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" onClick={() => void submit()} disabled={busy || !reason}>
              {busy ? "Sending..." : "Send report"}
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            False reports may affect your account. Only report real problems.
          </p>
        </div>
      </div>
    </div>
  );
}
