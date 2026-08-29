"use client";

import { useState } from "react";
import {
  STATUS_META,
  formatDate,
  formatPi,
  timeAgo,
  type HireRequest,
} from "@/lib/services/data";
import { useServices } from "@/contexts/services-context";
import { DEMO_JOBS, DEMO_REPUTATION } from "@/lib/services/demo-data";
import { Button, Card, cx, EmptyState, Pill } from "./ui";
import { MessagesScreen } from "./messages-screen";
import { ReviewsScreen } from "./reviews-screen";
import { PaymentScreen } from "./payment-screen";
import { EscrowActions } from "./escrow-actions";
import { IconCalendar, IconInbox, IconPaperclip, IconSend } from "./icons";

export function ActivityScreen({ onBrowse }: { onBrowse: () => void }) {
  const { outgoing, incoming, setRequestStatus } = useServices();
  const [tab, setTab] = useState<"received" | "sent">("received");
  const [openRequest, setOpenRequest] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-md pb-24">
      <div className="ps-hero-grad px-4 pb-4 pt-4 ps-safe-top">
        <h1 className="text-2xl font-bold text-foreground">My activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">Track hire requests you send and receive.</p>
      </div>

      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur">
        <div className="flex rounded-xl bg-secondary p-1">
          <TabBtn active={tab === "received"} onClick={() => setTab("received")} count={incoming.length}>
            Received
          </TabBtn>
          <TabBtn active={tab === "sent"} onClick={() => setTab("sent")} count={outgoing.length}>
            Sent
          </TabBtn>
        </div>
      </div>

      <div className="space-y-3 px-4 pt-4">
        {feedback && <p role="status" className="rounded-xl bg-success-soft px-3 py-2 text-xs font-medium text-success">{feedback}</p>}
        {tab === "received" ? (
          incoming.length === 0 ? (
            <EmptyState
              icon={<IconInbox size={26} />}
              title="No requests yet"
              message="When someone wants to hire one of your services, it will show up here."
            />
          ) : (
            incoming.map((r) => (
              <IncomingCard key={r.id} req={r} expanded={openRequest === r.id} onToggle={() => setOpenRequest(openRequest === r.id ? null : r.id)} onAccept={() => { void setRequestStatus(r.id, "accepted").then(() => setFeedback("Request accepted successfully.")).catch((err) => console.error("[Activity] Accept failed:", err)); }} onDecline={() => { void setRequestStatus(r.id, "declined").then(() => setFeedback("Request declined.")).catch((err) => console.error("[Activity] Decline failed:", err)); }} />
            ))
          )
        ) : outgoing.length === 0 ? (
          <EmptyState
            icon={<IconSend size={26} />}
            title="No sent requests"
            message="Find a service and tap Hire to send your first request."
            action={
              <Button size="sm" onClick={onBrowse}>
                Browse services
              </Button>
            }
          />
        ) : (
          outgoing.map((r) => <OutgoingCard key={r.id} req={r} expanded={openRequest === r.id} cancelled={cancelled.includes(r.id)} onToggle={() => setOpenRequest(openRequest === r.id ? null : r.id)} onCancel={() => { if (r.status !== "pending") { setFeedback("Only pending requests can be cancelled."); return; } setCancelled((items) => [...items, r.id]); setFeedback("Request cancelled successfully."); }} />)
        )}

        <OperationsPanel />
      </div>
    </div>
  );
}

function OperationsPanel() {
  const [open, setOpen] = useState<string | null>(null);
  const [showMessages, setShowMessages] = useState(false);
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [demoState, setDemoState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const toggle = (id: string) => setOpen((current) => (current === id ? null : id));
  const refresh = () => {
    setDemoState("loading");
    window.setTimeout(() => setDemoState("success"), 450);
  };
  return (
    <section className="border-t border-border pt-5" aria-labelledby="operations-title">
      <div className="flex items-start justify-between gap-3">
        <div><h2 id="operations-title" className="text-base font-bold text-foreground">Work center</h2><p className="mt-1 text-xs text-muted-foreground">Jobs, conversations, reviews and account records.</p></div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={demoState === "loading"}>{demoState === "loading" ? "Loading…" : "Refresh"}</Button>
      </div>
      {demoState === "success" && <p className="mt-2 rounded-lg bg-success-soft px-3 py-2 text-xs font-medium text-success">Latest activity is up to date.</p>}
      {demoState === "error" && <p className="mt-2 rounded-lg bg-destructive-soft px-3 py-2 text-xs font-medium text-destructive">Could not load activity. Try again.</p>}
      <div className="mt-3 space-y-2">
        <OpsGroup id="jobs" title="Jobs" summary={`${DEMO_JOBS.length} example jobs`} open={open === "jobs"} onClick={() => toggle("jobs")}>
          {DEMO_JOBS.map((job) => <div key={job.id} className="rounded-xl bg-secondary/60 p-3"><button type="button" className="w-full text-left" onClick={() => setOpenJob(openJob === job.id ? null : job.id)}><div className="flex justify-between gap-2"><p className="text-sm font-semibold text-foreground">{job.title}</p><Pill tone={job.status === "Delivered" ? "success" : "warning"}>{job.status}</Pill></div><p className="mt-1 text-xs text-muted-foreground">{job.role === "provider" ? "Provider view · owned by you" : "Customer view"} · Due {job.due} · {formatPi(job.amount)}</p></button>{openJob === job.id && <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground"><p>Job ID: {job.id}</p><p>Request ID: {job.requestId}</p><p>Participants: customer and provider</p><p>Related service: linked service record</p><p>Messages and reviews: available after the work is active</p><p>Payment status: not enabled; no payment was triggered.</p></div>}</div>)}
        </OpsGroup>
        <OpsGroup id="messages" title="Messages" summary="Accepted requests only" open={open === "messages"} onClick={() => toggle("messages")}>
          <Button variant="outline" size="sm" onClick={() => setShowMessages((value) => !value)}>{showMessages ? "Hide inbox" : "Open inbox"}</Button>
          {showMessages && <MessagesScreen />}
          <p className="mt-2 text-[11px] text-muted-foreground">Frontend demo state only; messages are not real-time or shared.</p>
        </OpsGroup>
        <OpsGroup id="reviews" title="Reviews & reputation" summary={DEMO_REPUTATION.score} open={open === "reviews"} onClick={() => toggle("reviews")}>
          <ReviewsScreen />
        </OpsGroup>
        <OpsGroup id="payments" title="Payments" summary="Not enabled" open={open === "payments"} onClick={() => toggle("payments")}>
          <PaymentScreen />
        </OpsGroup>
      </div>
    </section>
  );
}

function OpsGroup({ id, title, summary, open, onClick, children }: { id: string; title: string; summary: string; open: boolean; onClick: () => void; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card"><button type="button" aria-expanded={open} aria-controls={`${id}-panel`} onClick={onClick} className="flex w-full items-center justify-between gap-3 p-4 text-left"><span><span className="block text-sm font-bold text-foreground">{title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{summary}</span></span><span className="text-lg text-muted-foreground">{open ? "−" : "+"}</span></button>{open && <div id={`${id}-panel`} className="space-y-2 border-t border-border p-3">{children}</div>}</div>;
}

function TabBtn({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "ps-press flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
      )}
    >
      {children}
      {count > 0 && (
        <span
          className={cx(
            "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold",
            active ? "bg-primary text-primary-foreground" : "bg-border text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function StatusPill({ status }: { status: HireRequest["status"] }) {
  const meta = STATUS_META[status];
  return <Pill tone={meta.tone}>{meta.label}</Pill>;
}

function Meta({ req }: { req: HireRequest }) {
  return (
    <>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{req.message}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {req.deadline && (
          <span className="inline-flex items-center gap-1">
            <IconCalendar size={13} />
            By {formatDate(req.deadline)}
          </span>
        )}
        <span>{timeAgo(req.createdAt)}</span>
      </div>
      {req.attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {req.attachments.map((a, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2 py-1 text-xs text-secondary-foreground"
            >
              <IconPaperclip size={12} />
              {a}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function IncomingCard({
  req,
  onAccept,
  onDecline,
  expanded,
  onToggle,
}: {
  req: HireRequest;
  onAccept: () => void;
  onDecline: () => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Card className="p-4 ps-anim-fade-up">
      <button type="button" onClick={onToggle} className="w-full text-left">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">From {req.customerName}</p>
          <h3 className="ps-clamp-1 text-sm font-bold text-foreground">{req.serviceTitle}</h3>
        </div>
        <StatusPill status={req.status} />
      </div>
      <Meta req={req} />
      </button>
      {expanded && <div className="mt-3 rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground"><p>Request ID: {req.id}</p><p className="mt-1">Customer: {req.customerName}</p><p className="mt-1">Service ID: {req.serviceId}</p></div>}
      {req.status === "pending" && (
        <div className="mt-3 flex gap-2">
          <Button variant="success" size="sm" className="flex-1" onClick={onAccept}>
            Accept
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={onDecline}>
            Decline
          </Button>
        </div>
      )}
      {req.status !== "pending" && (
        <div className="mt-3">
          <EscrowActions req={req} />
        </div>
      )}
    </Card>
  );
}

function OutgoingCard({ req, expanded, cancelled, onToggle, onCancel }: { req: HireRequest; expanded: boolean; cancelled: boolean; onToggle: () => void; onCancel: () => void }) {
  return (
    <Card className="p-4 ps-anim-fade-up">
      <button type="button" onClick={onToggle} className="w-full text-left">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">To {req.providerName}</p>
          <h3 className="ps-clamp-1 text-sm font-bold text-foreground">{req.serviceTitle}</h3>
        </div>
        <StatusPill status={req.status} />
      </div>
      <Meta req={req} />
      </button>
      {expanded && <div className="mt-3 space-y-2 rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground"><p>Request ID: {req.id}</p><p>Provider: {req.providerName}</p><p>Service ID: {req.serviceId}</p>{cancelled ? <Pill tone="danger">Cancelled</Pill> : req.status === "pending" && <Button variant="outline" size="sm" onClick={onCancel}>Cancel request</Button>}</div>}
      {req.status !== "pending" && (
        <div className="mt-3">
          <EscrowActions req={req} />
        </div>
      )}
    </Card>
  );
}
