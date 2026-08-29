"use client";

import { useEffect, useMemo, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { useServices } from "@/contexts/services-context";
import { backendApi } from "@/lib/backend-api";
import type { HireRequest } from "@/lib/services/data";
import { Button, Card, EmptyState, Field, Pill, Select, TextArea, TextInput } from "./ui";

type DerivedStatus = "Open" | "Pending" | "Escalated" | "Resolved" | "Rejected";

const STATUS_TONES: Record<DerivedStatus, "primary" | "warning" | "success" | "danger" | "accent"> = {
  Open: "primary",
  Pending: "warning",
  Escalated: "accent",
  Resolved: "success",
  Rejected: "danger",
};

// Maps the real hire_requests row onto the same 5-state label set the
// original mock used, so the UI keeps its meaning even though it's now
// backed by real status/dispute_stage/resolved_favor columns.
function deriveStatus(row: any): DerivedStatus {
  if (row.status === "disputed") {
    if (row.dispute_stage === "escalated") return "Escalated";
    if (row.dispute_stage === "investigating") return "Pending";
    return "Open";
  }
  if (row.resolved_favor === "buyer") return "Resolved"; // claim upheld -> refunded
  if (row.resolved_favor === "provider") return "Rejected"; // claim rejected -> released
  return "Open";
}

export function DisputeResolution({ onClose }: { onClose: () => void }) {
  const { accessToken } = usePiAuth();
  const { requests, fileDispute, pushToast, refreshRequests } = useServices();
  const [view, setView] = useState<"admin" | "user">("admin");
  const [disputes, setDisputes] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<DerivedStatus | "All">("All");
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notAdmin, setNotAdmin] = useState(false);

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    setNotAdmin(false);
    try {
      const { disputes: rows } = await backendApi.admin.listDisputes(accessToken);
      setDisputes(rows);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load disputes";
      if (message.toLowerCase().includes("admin")) setNotAdmin(true);
      else setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view === "admin") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, accessToken]);

  const selected = disputes.find((d) => d.id === selectedId) ?? null;

  const filtered = useMemo(
    () =>
      disputes.filter((d) => {
        const s = deriveStatus(d);
        const matchesStatus = statusFilter === "All" || s === statusFilter;
        const haystack = `${d.id} ${d.buyer?.username ?? ""} ${d.provider?.username ?? ""} ${d.services?.title ?? ""}`.toLowerCase();
        return matchesStatus && haystack.includes(query.toLowerCase());
      }),
    [disputes, statusFilter, query]
  );

  const counts = useMemo(() => {
    const c: Record<DerivedStatus, number> = { Open: 0, Pending: 0, Escalated: 0, Resolved: 0, Rejected: 0 };
    for (const d of disputes) c[deriveStatus(d)]++;
    return c;
  }, [disputes]);

  const handleResolve = async (favorProvider: boolean, note: string) => {
    if (!selected || !accessToken) return;
    try {
      await backendApi.admin.resolveDispute(selected.id, { favorProvider, note: note || undefined }, accessToken);
      pushToast(favorProvider ? "Dispute rejected — funds released to provider" : "Dispute resolved — buyer refunded", "success");
      setSelectedId(null);
      await load();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Action failed", "warning");
    }
  };

  const handleStage = async (stage: "investigating" | "escalated", note?: string) => {
    if (!selected || !accessToken) return;
    try {
      await backendApi.admin.updateDispute(selected.id, { stage, note }, accessToken);
      await load();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Action failed", "warning");
    }
  };

  return (
    <main className="min-h-screen bg-background pb-10">
      <header className="ps-hero-grad border-b border-border px-4 pb-5 pt-4 ps-safe-top">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div>
            <p className="ps-eyebrow">Pi Services</p>
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
        <div className="flex rounded-xl border border-border bg-card p-1" role="tablist" aria-label="Dispute views">
          <button
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${view === "admin" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => {
              setView("admin");
              setSelectedId(null);
            }}
          >
            Admin workspace
          </button>
          <button
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${view === "user" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => {
              setView("user");
              setSelectedId(null);
            }}
          >
            My disputes
          </button>
        </div>

        {view === "user" ? (
          <UserView requests={requests} fileDispute={fileDispute} showCreate={showCreate} setShowCreate={setShowCreate} submittedId={submittedId} setSubmittedId={setSubmittedId} />
        ) : notAdmin ? (
          <EmptyState title="Admin access required" message="This Pi account is not on the platform's admin list. Ask an existing admin to add your uid to ADMIN_PI_UIDS." />
        ) : selected ? (
          <Detail dispute={selected} onBack={() => setSelectedId(null)} onResolve={handleResolve} onStage={handleStage} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {(["Open", "Pending", "Resolved", "Escalated"] as DerivedStatus[]).map((s) => (
                <Card key={s} className="p-3">
                  <p className="text-xs text-muted-foreground">{s}</p>
                  <p className="mt-1 text-xl font-bold text-foreground">{counts[s]}</p>
                </Card>
              ))}
            </div>
            <div className="flex gap-2">
              <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search disputes…" aria-label="Search disputes" />
              <Button variant="outline" onClick={load} disabled={loading}>
                {loading ? "Loading…" : "Refresh"}
              </Button>
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as DerivedStatus | "All")} aria-label="Filter by status">
              <option>All</option>
              {(["Open", "Pending", "Escalated", "Resolved", "Rejected"] as DerivedStatus[]).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
            {error && (
              <p role="alert" className="rounded-xl bg-destructive-soft px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            {filtered.length === 0 ? (
              <EmptyState title="No disputes found" message="Try another search or status filter." />
            ) : (
              filtered.map((d) => (
                <button key={d.id} className="text-left" onClick={() => setSelectedId(d.id)}>
                  <Card className="p-4 transition hover:border-primary">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-foreground">{d.services?.title ?? "Service"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {d.id.slice(0, 8)} · {d.buyer?.username ?? "buyer"} vs {d.provider?.username ?? "provider"}
                        </p>
                      </div>
                      <Pill tone={STATUS_TONES[deriveStatus(d)]}>{deriveStatus(d)}</Pill>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{d.dispute_reason || "No reason given"}</p>
                  </Card>
                </button>
              ))
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Detail({
  dispute,
  onBack,
  onResolve,
  onStage,
}: {
  dispute: any;
  onBack: () => void;
  onResolve: (favorProvider: boolean, note: string) => void;
  onStage: (stage: "investigating" | "escalated", note?: string) => void;
}) {
  const [note, setNote] = useState(dispute.admin_note ?? "");
  const status = deriveStatus(dispute);
  const isOpenOrPending = status === "Open" || status === "Pending" || status === "Escalated";

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        ← Back to disputes
      </Button>
      <Card className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="ps-eyebrow">{dispute.id.slice(0, 8)}</p>
            <h2 className="mt-1 text-xl font-bold text-foreground">{dispute.dispute_reason || "No reason given"}</h2>
          </div>
          <Pill tone={STATUS_TONES[status]}>{status}</Pill>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Info label="Buyer" value={dispute.buyer?.display_name || dispute.buyer?.username || dispute.buyer_uid} />
          <Info label="Provider" value={dispute.provider?.display_name || dispute.provider?.username || dispute.provider_uid} />
          <Info label="Service" value={dispute.services?.title ?? "—"} />
          <Info label="Amount" value={`${dispute.amount} Pi`} />
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Details</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{dispute.dispute_details || "No further details provided."}</p>
        </div>
        {dispute.dispute_evidence?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Evidence</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {dispute.dispute_evidence.map((file: string) => (
                <Pill key={file}>{file}</Pill>
              ))}
            </div>
          </div>
        )}
      </Card>

      {isOpenOrPending ? (
        <Card className="space-y-3 p-4">
          <h3 className="font-bold text-foreground">Admin notes & outcome</h3>
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Add an internal note…" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onStage("investigating", note)}>
              Investigate
            </Button>
            <Button variant="accent" size="sm" onClick={() => onStage("escalated", note)}>
              Escalate
            </Button>
            <Button variant="success" size="sm" onClick={() => onResolve(false, note)}>
              Resolve — refund buyer
            </Button>
            <Button variant="danger" size="sm" onClick={() => onResolve(true, note)}>
              Reject — release to provider
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <p className="rounded-xl bg-success-soft p-3 text-sm text-success">
            {status === "Resolved"
              ? `Resolved: ${dispute.amount} Pi refunded to the buyer.`
              : `Rejected: ${dispute.amount} Pi released to the provider.`}
          </p>
          {dispute.admin_note && <p className="mt-2 text-xs text-muted-foreground">Note: {dispute.admin_note}</p>}
        </Card>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/60 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
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
}: {
  requests: HireRequest[];
  fileDispute: (id: string, input: { reason: string; details?: string; evidence?: string[] }) => Promise<void>;
  showCreate: boolean;
  setShowCreate: (v: boolean) => void;
  submittedId: string | null;
  setSubmittedId: (v: string | null) => void;
}) {
  const eligible = useMemo(() => requests.filter((r) => DISPUTABLE_STATUSES.has(r.status)), [requests]);
  const mine = useMemo(
    () => requests.filter((r) => r.status === "disputed" || r.disputeStage || r.resolvedFavor),
    [requests]
  );

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
        <Card className="space-y-3 p-4">
          <h2 className="text-lg font-bold text-foreground">My disputes</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Create a dispute for a funded hire request, then follow its status here.
          </p>
          <Button onClick={() => setShowCreate(true)} disabled={eligible.length === 0}>
            {eligible.length === 0 ? "No eligible requests" : "Create dispute"}
          </Button>
        </Card>
        {mine.length === 0 ? (
          <EmptyState title="No disputes yet" message="Disputes you file or that are filed against you will show up here." />
        ) : (
          mine.map((r) => {
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
