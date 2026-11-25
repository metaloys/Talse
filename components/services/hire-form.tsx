"use client";

import { useEffect, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { backendApi } from "@/lib/backend-api";
import {
  MESSAGE_MAX,
  cleanStr,
  deliveryLabel,
  formatPi,
  serviceImage,
  todayISO,
  type Service,
} from "@/lib/services/data";
import { getFrontendPlatformFeePercent, calcPlatformFee, BLOCKCHAIN_GAS_LABEL } from "@/lib/frontend-fee-config";
import { useServices } from "@/contexts/services-context";
import { Overlay } from "./feedback";
import { Button, Card, cx, Field, IconButton, Pill, TextArea, TextInput } from "./ui";
import { IconCheck, IconClock, IconPaperclip, IconPlus, IconSend, IconShield, IconTrash } from "./icons";

export function HireForm({
  service,
  open,
  onClose,
  onSent,
}: {
  service: Service | null;
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [message, setMessage] = useState("");
  const [deadline, setDeadline] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attachDraft, setAttachDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { accessToken } = usePiAuth();
  const { refreshRequests } = useServices();
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(1);
      setMessage("");
      setDeadline("");
      setAttachments([]);
      setAttachDraft("");
      setShowErrors(false);
    }
  }, [open, service?.id]);

  if (!service) return null;

  const trimmedMsg = message.trim();
  const msgError = trimmedMsg.length < 5 ? "Please describe what you need (at least 5 characters)." : "";
  const deadlineError = !deadline ? "Choose a preferred deadline." : "";
  const canSend = !msgError && !deadlineError;

  const pct = getFrontendPlatformFeePercent();
  const fee = calcPlatformFee(service.price, pct);
  const receive = Math.round((service.price - fee) * 100) / 100;
  const formattedDeadline = deadline
    ? new Date(`${deadline}T00:00:00`).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";
  const referenceCount = files.length + attachments.length;

  const goReview = () => {
    if (!canSend) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep(2);
  };

  const addAttachment = () => {
    const clean = cleanStr(attachDraft, 80);
    if (!clean) return;
    setAttachments((prev) => (prev.length >= 6 ? prev : [...prev, clean]));
    setAttachDraft("");
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files ?? []);
    if (!chosen.length) return;
    const cap = 6 - (attachments.length + files.length);
    const toAdd = chosen.slice(0, cap);
    setFiles((prev) => [...prev, ...toAdd]);
    e.currentTarget.value = "";
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const uploadFilesForRequest = async (hireRequestId: string) => {
    if (!files.length) return [] as string[];
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      files.forEach((f) => form.append("file", f));
      const res = await fetch(`/api/hire-requests/${hireRequestId}/attachments`, {
        method: "POST",
        body: form,
        headers: { Authorization: `Bearer ${accessToken ?? ""}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Upload failed");
      }
      const data = await res.json();
      return data.paths ?? [];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setUploadError("Attachment upload failed. Please try again or remove the file.");
      throw new Error(message);
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!canSend) {
      setShowErrors(true);
      setStep(1);
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    setUploadError(null);
    try {
      // create hire request via backend directly so we get the id
      const token = accessToken;
      if (!token) throw new Error("Not authenticated");
      const { request } = await backendApi.hireRequests.create({ serviceId: service.id, message: trimmedMsg, deadline, attachments }, token);
      const hireId = request.id;
      const paths = await uploadFilesForRequest(hireId);
      if (paths.length) {
        await refreshRequests();
      }
      onSent();
    } catch (err) {
      console.error("Failed to send hire request:", err);
      setShowErrors(true);
      if (err instanceof Error && /upload/i.test(err.message)) {
        setUploadError("Attachment upload failed. Please try again or remove the file.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const img = service.coverImage ?? service.images[0];

  return (
    <Overlay open={open} onClose={onClose} title="Hire request">
      <div className="mx-auto max-w-2xl p-4 pb-28">
        {/* stepper */}
        <div className="mb-4 flex items-center gap-2">
          <span
            className={cx(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
              step >= 1 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
            )}
          >
            {step > 1 ? <IconCheck size={13} /> : 1}
          </span>
          <span className={cx("text-xs font-semibold", step === 1 ? "text-foreground" : "text-muted-foreground")}>
            Describe
          </span>
          <span className="mx-1 h-px flex-1 bg-border" />
          <span
            className={cx(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
              step >= 2 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
            )}
          >
            2
          </span>
          <span className={cx("text-xs font-semibold", step === 2 ? "text-foreground" : "text-muted-foreground")}>
            Review &amp; send
          </span>
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            {/* service recap */}
            <Card className="flex items-center gap-3 p-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-secondary">
                <img
                  src={img ? serviceImage(img, 120, 120) : "/placeholder.svg?height=120&width=120&query=service"}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="ps-clamp-1 text-sm font-semibold text-foreground">{service.title}</h3>
                <p className="text-xs text-muted-foreground">by {service.ownerName}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-sm font-bold text-primary ps-nums">{formatPi(service.price)}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <IconClock size={12} />
                    {deliveryLabel(service.deliveryId)}
                  </span>
                </div>
              </div>
            </Card>

            <Field
              label="What do you need?"
              htmlFor="hire-msg"
              error={showErrors ? msgError : undefined}
              counter={`${message.length}/${MESSAGE_MAX}`}
            >
              <TextArea
                id="hire-msg"
                rows={5}
                maxLength={MESSAGE_MAX}
                placeholder="Describe the work, any details, and questions you have..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>

            <Field label="Preferred deadline" htmlFor="hire-deadline" error={showErrors ? deadlineError : undefined}>
              <TextInput
                id="hire-deadline"
                type="date"
                min={todayISO()}
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </Field>

            <Field label="Reference notes (optional)" hint="Add short notes or links to references. Files can be shared with the provider once they accept.">
              <div className="flex gap-2">
                <TextInput
                  placeholder="e.g. Brand colors, example link..."
                  value={attachDraft}
                  maxLength={80}
                  onChange={(e) => setAttachDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                      e.preventDefault();
                      addAttachment();
                    }
                  }}
                />
                <IconButton
                  label="Add reference"
                  className="h-11 w-11 shrink-0 border border-border bg-card"
                  onClick={addAttachment}
                >
                  <IconPlus size={18} />
                </IconButton>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input id="hire-files" type="file" accept="image/*,application/pdf" multiple onChange={onFileSelected} className="hidden" />
                <label htmlFor="hire-files" className="ps-press inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">Attach files</label>
                {uploading && <span className="text-xs text-muted-foreground">Uploading...</span>}
              </div>
              {files.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm">
                      <IconPaperclip size={15} className="shrink-0 text-muted-foreground" />
                      <span className="ps-clamp-1 flex-1 text-foreground">{f.name}</span>
                      <IconButton label="Remove file" className="h-7 w-7 text-muted-foreground" onClick={() => removeFile(i)}>
                        <IconTrash size={15} />
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}
              {uploadError && <p className="mt-2 text-xs font-medium text-destructive">{uploadError}</p>}
              {attachments.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {attachments.map((a, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm"
                    >
                      <IconPaperclip size={15} className="shrink-0 text-muted-foreground" />
                      <span className="ps-clamp-1 flex-1 text-foreground">{a}</span>
                      <IconButton
                        label="Remove reference"
                        className="h-7 w-7 text-muted-foreground"
                        onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <IconTrash size={15} />
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}
            </Field>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Sending a request starts a conversation. Agree on the details and terms directly with the provider before any
              work begins.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-foreground">Review your request</h2>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="ps-press text-xs font-semibold text-primary"
                >
                  Edit
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Nothing is charged now. You only fund escrow after the provider accepts.
              </p>

              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Service</span>
                  <span className="max-w-[65%] text-right font-medium text-foreground">{service.title}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Provider</span>
                  <span className="text-right font-medium text-foreground">{service.ownerName}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Deadline</span>
                  <span className="text-right font-medium text-foreground">{formattedDeadline}</span>
                </div>

                <div className="my-1 border-t border-border" />

                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Service price</span>
                  <span className="font-bold text-foreground ps-nums">{formatPi(service.price)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">Platform fee ({Math.round(pct * 100)}%)</span>
                  <span className="text-muted-foreground ps-nums">-{formatPi(fee)} from payout</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">Provider receives</span>
                  <span className="font-medium text-foreground ps-nums">{formatPi(receive)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg bg-primary-soft px-2.5 py-2">
                  <span className="text-xs font-semibold text-primary">You pay today</span>
                  <span className="text-sm font-bold text-primary ps-nums">0 π</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{BLOCKCHAIN_GAS_LABEL}</p>
              </div>
            </Card>

            <Card className="flex items-start gap-2.5 bg-secondary/50 p-4">
              <IconShield size={18} className="mt-0.5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">How escrow protects you</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  After the provider accepts, you fund escrow. Your Pi stays locked until you confirm the work is
                  delivered — then it&apos;s released to the provider.
                </p>
              </div>
            </Card>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground">Your message</p>
                {referenceCount > 0 && (
                  <Pill tone="neutral" className="text-[10px]">
                    {referenceCount} reference{referenceCount === 1 ? "" : "s"}
                  </Pill>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap rounded-xl border border-border bg-card p-3 text-sm leading-relaxed text-foreground">
                {trimmedMsg}
              </p>
            </div>

            {uploadError && <p className="text-xs font-medium text-destructive">{uploadError}</p>}
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 px-4 py-3 ps-safe-bottom backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          {step === 2 && (
            <Button variant="outline" size="lg" onClick={() => setStep(1)} disabled={submitting}>
              Back
            </Button>
          )}
          {step === 1 ? (
            <Button className="flex-1" size="lg" onClick={goReview}>
              <IconSend size={18} />
              Review request
            </Button>
          ) : (
            <Button className="flex-1" size="lg" onClick={() => void submit()} disabled={submitting || uploading}>
              <IconSend size={18} />
              {submitting ? "Sending..." : "Send hire request"}
            </Button>
          )}
        </div>
      </div>
    </Overlay>
  );
}