"use client";

import { useEffect, useMemo, useState } from "react";
import { useServices } from "@/contexts/services-context";
import { APP_NAME, type HireRequest } from "@/lib/services/data";
import { Button, Card, cx, EmptyState, Field, Pill, Select, TextArea, TextInput } from "./ui";
import { IconArrowRight, IconCheckCircle, IconClock, IconFlag, IconShield, IconWallet } from "./icons";

type DerivedStatus = "Open" | "Pending" | "Escalated" | "Resolved" | "Rejected";

const STATUS_TONES: Record<DerivedStatus, "primary" | "warning" | "success" | "danger" | "accent"> = {
  Open: "primary",
  Pending: "warning",
  Escalated: "accent",
  Resolved: "success",
  Rejected: "danger",
};

function deriveStatus(row: HireRequest): DerivedStatus {
  if (row.status === "disputed") {
    if (row.disputeStage === "escalated") return "Escalated";
    if (row.disputeStage === "investigating") return "Pending";
    return "Open";
  }
  if (row.resolvedFavor === "buyer") return "Resolved";
  if (row.resolvedFavor === "provider") return "Rejected";
  return "Open";
}

function formatDate(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Stage strip shown on each dispute card. Disputes move
 * Filed -> Under review -> Resolved, so the bar tells a Pioneer at a glance
 * how far along their case is without needing to decode a status string.
 */
function DisputeTimeline({ status }: { status: DerivedStatus }) {
  const reached = status === "Open" ? 1 : status === "Pending" || status === "Escalated" ? 2 : 3;
  const steps = ["Filed", status === "Escalated" ? "Escalated" : "Under review", "Resolved"];
  return (
    <ol className="mt-3 flex items-center gap-2" aria-label="Dispute progress">
      {steps.map((label, index) => {
        const done = index < reached;
        const current = index === reached - 1 && status !== "Resolved" && status !== "Rejected";
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cx(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                done ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                current && "ring-2 ring-primary/30",
              )}
            >
              {done ? <IconCheckCircle size={13} /> : index + 1}
            </span>
            <span
              className={cx(
                "whitespace-nowrap text-[11px] font-medium",
                done ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {index < steps.length - 1 && (
              <span className={cx("h-px flex-1", index < reached - 1 ? "bg-primary" : "bg-border")} aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function DisputeResolution({ onClose, requestId }: { onClose: () => void; requestId?: string }) {
  const { requests, fileDispute } = useServices();
  const [showCreate, setShowCreate] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  return (
    <main className="min-h-screen bg-background pb-16">
      <header className="ps-hero-grad border-b border-border px-4 pb-6 pt-4 ps-safe-top">
        <div className="mx-auto flex max-w-2xl items-start justify-between gap-3">
          <div>
            <p className="ps-eyebrow flex items-center gap-1.5">
              <IconShield size={13} /> {APP_NAME} · Trust &amp; Safety
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              Dispute resolution
            </h1>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Tell us what went wrong. The escrowed Pi stays frozen until our team reviews the case and rules on it.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onClose} className="shrink-0">
            Close
          </Button>
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-5">
        <UserView
          requests={requests}
          fileDispute={fileDispute}
          showCreate={showCreate}
          setShowCreate={setShowCreate}
          submittedId={submittedId}
          setSubmittedId={setSubmittedId}
          focusRequestId={requestId}
        />
      </div>
    </main>
  );
}

// Requests eligible to dispute: funded and not yet closed out.
const DISPUTABLE_STATUSES = new Set(["locked", "delivered"]);

function UserView({
  requests,
  fileDispute,
  showCreate,
  setShowCreate,
  submittedId,
  setSubmittedId,
  focusRequestId,
}: {
  requests: HireRequest[];
  fileDispute: (id: string, input: { reason: string; details?: string; evidence?: string[] }) => Promise<void>;
  showCreate: boolean;
  setShowCreate: (v: boolean) => void;
  submittedId: string | null;
  setSubmittedId: (v: string | null) => void;
  focusRequestId?: string;
}) {
  const eligible = useMemo(() => requests.filter((r) => DISPUTABLE_STATUSES.has(r.status)), [requests]);
  const mine = useMemo(
    () => requests.filter((r) => r.status === "disputed" || r.disputeStage || r.resolvedFavor),
    [requests],
  );
  const focusedMine = focusRequestId ? mine.filter((r) => r.id === focusRequestId) : mine;

  const [jobId, setJobId] = useState(eligible[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [evidence, setEvidence] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId && eligible[0]) setJobId(eligible[0].id);
  }, [eligible, jobId]);

  const selectedJob = eligible.find((r) => r.id === jobId);

  const submit = async () => {
    if (!jobId || !reason.trim() || !details.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await fileDispute(jobId, {
        reason: reason.trim(),
        details: details.trim(),
        evidence: evidence
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setSubmittedId(jobId);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit dispute");
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedId) {
    const req = requests.find((r) => r.id === submittedId);
    return (
      <Card className="ps-anim-fade-up overflow-hidden p-0">
        <div className="flex flex-col items-center bg-primary-soft/50 px-5 py-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-card text-primary shadow-sm">
            <IconCheckCircle size={26} />
          </span>
          <h2 className="mt-3 text-lg font-bold text-foreground">Dispute submitted</h2>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
            Your request is now marked disputed.{" "}
            <span className="font-semibold text-foreground">
              {req?.servicePrice ?? ""} Pi stays locked in escrow
            </span>{" "}
            until an admin reviews the details and evidence.
          </p>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3.5 py-3">
            <div className="min-w-0">
              <p className="ps-clamp-1 text-sm font-semibold text-foreground">{req?.serviceTitle ?? "Hire request"}</p>
              <p className="text-xs text-muted-foreground">Ref {submittedId.slice(0, 8).toUpperCase()}</p>
            </div>
            <Pill tone="primary">Open</Pill>
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-secondary px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
            <IconClock size={15} className="mt-0.5 shrink-0 text-primary" />
            <p>Most cases are reviewed within 24–48 hours. You&apos;ll get a notification when the ruling is in.</p>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setSubmittedId(null);
              setShowCreate(false);
              setReason("");
              setDetails("");
              setEvidence("");
            }}
          >
            View my disputes
          </Button>
        </div>
      </Card>
    );
  }

  if (!showCreate) {
    return (
      <>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">My disputes</h2>
            <p className="text-xs text-muted-foreground">
              {focusedMine.length === 0 ? "Nothing filed yet" : `${focusedMine.length} open case${focusedMine.length === 1 ? "" : "s"}`}
            </p>
          </div>
          {!focusRequestId && (
            <Button size="sm" onClick={() => setShowCreate(true)} disabled={eligible.length === 0}>
              {eligible.length === 0 ? "No eligible jobs" : "New dispute"}
            </Button>
          )}
        </div>

        {!focusRequestId && eligible.length === 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
            <IconWallet size={16} className="mt-0.5 shrink-0 text-primary" />
            <p>
              You can open a dispute on any job once its Pi is held in escrow or the provider has marked it delivered.
            </p>
          </div>
        )}

        {focusedMine.length === 0 ? (
          <EmptyState
            icon={<IconShield size={26} />}
            title="No disputes yet"
            message="Disputes you file, or that are filed against you, will show up here with their progress."
          />
        ) : (
          <div className="space-y-3">
            {focusedMine.map((r) => {
              const status = deriveStatus(r);
              return (
                <Card key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="ps-clamp-1 font-semibold text-foreground">{r.serviceTitle}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Ref {r.id.slice(0, 8).toUpperCase()} · filed {formatDate(r.createdAt)}
                      </p>
                    </div>
                    <Pill tone={STATUS_TONES[status]}>{status}</Pill>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-secondary px-3 py-2">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <IconWallet size={14} className="text-primary" /> Held in escrow
                    </span>
                    <span className="text-sm font-bold text-foreground ps-nums">{r.servicePrice} π</span>
                  </div>

                  <p className="mt-3 text-sm leading-relaxed text-foreground">
                    <span className="font-semibold">Reason:</span> {r.disputeReason || "No reason given"}
                  </p>

                  {r.adminNote && (
                    <div className="mt-2 rounded-xl border border-primary/20 bg-primary-soft/40 px-3 py-2 text-xs leading-relaxed text-foreground">
                      <span className="font-semibold">Admin note:</span> {r.adminNote}
                    </div>
                  )}

                  <DisputeTimeline status={status} />
                </Card>
              );
            })}
          </div>
        )}
      </>
    );
  }

  return (
    <Card className="p-0">
      <div className="border-b border-border px-5 pb-4 pt-4">
        <button
          type="button"
          onClick={() => setShowCreate(false)}
          className="ps-press text-xs font-semibold text-primary"
        >
          ← Back to my disputes
        </button>
        <h2 className="mt-2 text-lg font-bold text-foreground">Open a dispute</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          Be specific — dates, what was promised, and any proof you can attach all help us rule faster.
        </p>
      </div>

      <div className="space-y-4 px-5 py-5">
        <Field label="Which job?" htmlFor="dispute-job">
          <Select id="dispute-job" value={jobId} onChange={(e) => setJobId(e.target.value)}>
            {eligible.map((r) => (
              <option key={r.id} value={r.id}>
                {r.serviceTitle} · {r.servicePrice} Pi
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Reason" htmlFor="dispute-reason">
          <TextInput
            id="dispute-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What went wrong?"
          />
        </Field>

        <Field label="Details" htmlFor="dispute-details" hint="Explain what was agreed and what actually happened.">
          <TextArea
            id="dispute-details"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={5}
            placeholder="Describe the issue clearly..."
          />
        </Field>

        <Field
          label="Evidence or attachment names"
          htmlFor="dispute-evidence"
          hint="Comma-separated filenames — file upload isn't wired to storage yet."
        >
          <TextInput
            id="dispute-evidence"
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="e.g. screenshot.png, brief.pdf"
          />
        </Field>

        <div className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-[11px] leading-relaxed text-warning-foreground">
          <IconFlag size={15} className="mt-0.5 shrink-0" />
          <p>
            Filing freezes {selectedJob ? `${selectedJob.servicePrice} Pi` : "the escrow"} — no funds move to either side
            until a ruling is made.
          </p>
        </div>

        {submitError && (
          <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-xs font-medium text-destructive">
            {submitError}
          </p>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={!reason.trim() || !details.trim() || submitting}
            onClick={() => void submit()}
          >
            {submitting ? "Submitting..." : "Submit dispute"}
            {!submitting && <IconArrowRight size={15} />}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default DisputeResolution;
