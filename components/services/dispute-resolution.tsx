"use client";

import { useEffect, useMemo, useState } from "react";
import { useServices } from "@/contexts/services-context";
import { APP_NAME, type HireRequest } from "@/lib/services/data";
import { Button, Card, EmptyState, Field, Pill, Select, TextArea, TextInput } from "./ui";

type DerivedStatus = "Open" | "Pending" | "Escalated" | "Resolved" | "Rejected";

const STATUS_TONES: Record<DerivedStatus, "primary" | "warning" | "success" | "danger" | "accent"> = {
  Open: "primary",
  Pending: "warning",
  Escalated: "accent",
  Resolved: "success",
  Rejected: "danger",
};

function deriveStatus(row: any): DerivedStatus {
  if (row.status === "disputed") {
    if (row.dispute_stage === "escalated") return "Escalated";
    if (row.dispute_stage === "investigating") return "Pending";
    return "Open";
  }
  if (row.resolved_favor === "buyer") return "Resolved";
  if (row.resolved_favor === "provider") return "Rejected";
  return "Open";
}

export function DisputeResolution({ onClose, requestId }: { onClose: () => void; requestId?: string }) {
  const { requests, fileDispute } = useServices();
  const [showCreate, setShowCreate] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  return (
    <main className="min-h-screen bg-background pb-10">
      <header className="ps-hero-grad border-b border-border px-4 pb-5 pt-4 ps-safe-top">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div>
            <p className="ps-eyebrow">{APP_NAME}</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">Dispute Resolution</h1>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
          Resolving a dispute pays out the escrowed Pi immediately — to the provider if rejected, back to the buyer if
          upheld.
        </p>
      </header>

      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-4">
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
    [requests]
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
      <Card className="space-y-3 p-5">
        <p className="text-lg font-bold text-foreground">Dispute submitted</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your request is now marked disputed. The escrowed {req?.servicePrice ?? ""} Pi stays locked until an admin
          reviews the details and evidence.
        </p>
        <Pill tone="primary">{submittedId.slice(0, 8)} · Open</Pill>
        <Button
          variant="outline"
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
      </Card>
    );
  }

  if (!showCreate) {
    return (
      <>
        {!focusRequestId && (
          <Card className="space-y-3 p-4">
            <h2 className="text-lg font-bold text-foreground">My disputes</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Create a dispute for a funded hire request, then follow its status here.
            </p>
            <Button onClick={() => setShowCreate(true)} disabled={eligible.length === 0}>
              {eligible.length === 0 ? "No eligible requests" : "Create dispute"}
            </Button>
          </Card>
        )}
        {focusedMine.length === 0 ? (
          <EmptyState title="No disputes yet" message="Disputes you file or that are filed against you will show up here." />
        ) : (
          focusedMine.map((r) => {
            const label =
              r.status === "disputed"
                ? r.disputeStage === "escalated"
                  ? "Escalated"
                  : r.disputeStage === "investigating"
                    ? "Pending"
                    : "Open"
                : r.resolvedFavor === "buyer"
                  ? "Resolved"
                  : "Rejected";
            const tone = STATUS_TONES[label as DerivedStatus];
            return (
              <Card key={r.id} className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">
                      {r.id.slice(0, 8)} · {r.serviceTitle}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{r.disputeReason || "No reason given"}</p>
                  </div>
                  <Pill tone={tone}>{label}</Pill>
                </div>
                {r.adminNote && <p className="text-sm text-muted-foreground">Admin note: {r.adminNote}</p>}
              </Card>
            );
          })
        )}
      </>
    );
  }

  return (
    <Card className="space-y-4 p-4">
      <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
        ← My disputes
      </Button>
      <h2 className="text-lg font-bold text-foreground">Create dispute</h2>
      <Field label="Related job or request" htmlFor="dispute-job">
        <Select id="dispute-job" value={jobId} onChange={(e) => setJobId(e.target.value)}>
          {eligible.map((r) => (
            <option key={r.id} value={r.id}>
              {r.serviceTitle} · {r.servicePrice} Pi
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Reason" htmlFor="dispute-reason">
        <TextInput id="dispute-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What went wrong?" />
      </Field>
      <Field label="Details" htmlFor="dispute-details">
        <TextArea id="dispute-details" value={details} onChange={(e) => setDetails(e.target.value)} rows={5} placeholder="Describe the issue clearly…" />
      </Field>
      <Field label="Evidence or attachment names" htmlFor="dispute-evidence" hint="Comma-separated filenames for now — file upload isn't wired to storage yet.">
        <TextInput id="dispute-evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="e.g. screenshot.png, brief.pdf" />
      </Field>
      {submitError && <p className="text-xs text-destructive">{submitError}</p>}
      <Button disabled={!reason.trim() || !details.trim() || submitting} onClick={submit}>
        {submitting ? "Submitting…" : "Submit dispute"}
      </Button>
    </Card>
  );
}

export default DisputeResolution;
