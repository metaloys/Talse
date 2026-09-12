"use client";

import { useMemo, useState, useEffect } from "react";
import { STATUS_META, formatPi, timeAgo, type HireRequest } from "@/lib/services/data";
import { backendApi } from "@/lib/backend-api";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { useServices } from "@/contexts/services-context";
import { Button, Card, EmptyState, Pill } from "./ui";
import { EscrowActions } from "./escrow-actions";

export function ActivityScreen({ onBrowse, initialOpenRequestId, onOpenMessages, onViewDispute }: { onBrowse: () => void; initialOpenRequestId?: string | null; onOpenMessages?: (requestId: string) => void; onViewDispute?: (requestId: string) => void }) {
  const { outgoing, incoming, setRequestStatus, pushToast, requests } = useServices();
  const { accessToken } = usePiAuth();
  const [openRequest, setOpenRequest] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reviewPromptFor, setReviewPromptFor] = useState<null | HireRequest>(null);

  useEffect(() => {
    if (!initialOpenRequestId) return;
    if (requests.length === 0) return;
    const found = requests.find((r) => r.id === initialOpenRequestId);
    if (found) {
      setOpenRequest(found.id);
    } else {
      pushToast("Requested item not found or access denied", "warning");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenRequestId, requests.length]);

  const allRequests = useMemo(
    () => [...incoming, ...outgoing].sort((a, b) => b.createdAt - a.createdAt),
    [incoming, outgoing],
  );

  const groupedRequests = useMemo(() => {
    const groups = {
      needsAction: [] as HireRequest[],
      active: [] as HireRequest[],
      completed: [] as HireRequest[],
      other: [] as HireRequest[],
    };

    for (const req of allRequests) {
      const status = cancelled.includes(req.id) ? "cancelled" : req.status;
      if (status === "pending") {
        groups.needsAction.push(req);
      } else if (["accepted", "locked", "delivered", "disputed"].includes(status)) {
        groups.active.push(req);
      } else if (["released", "refunded", "cancelled", "declined"].includes(status)) {
        groups.completed.push(req);
      } else {
        groups.other.push(req);
      }
    }

    return groups;
  }, [allRequests, cancelled]);

  const sectionOrder = [
    { key: "needsAction", title: "Needs action" },
    { key: "active", title: "Active" },
    { key: "completed", title: "Completed" },
    { key: "other", title: "Other" },
  ] as const;

  const requestCard = (req: HireRequest) => {
    const status = cancelled.includes(req.id) ? "cancelled" : req.status;
    const counterpart = req.direction === "incoming" ? req.customerName : req.providerName;
    const cardExpanded = openRequest === req.id;

    return (
      <Card key={req.id} className="p-4 ps-anim-fade-up">
        <button type="button" onClick={() => setOpenRequest(cardExpanded ? null : req.id)} className="w-full text-left">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {req.direction === "incoming" ? "From" : "To"} {counterpart}
              </p>
              <h3 className="ps-clamp-1 text-sm font-bold text-foreground">{req.serviceTitle}</h3>
            </div>
            <StatusPill status={status} />
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-lg font-bold text-primary ps-nums">{formatPi(req.servicePrice)}</p>
            <span className="text-xs text-muted-foreground">{timeAgo(req.createdAt)}</span>
          </div>

          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-foreground">
            {req.message?.trim() ? req.message.trim().replace(/\s+/g, " ") : "No message provided."}
          </p>
        </button>

        {cardExpanded && (
          <div className="mt-3 rounded-xl bg-secondary/60 p-3 text-sm text-foreground">
            <p className="whitespace-pre-wrap leading-relaxed text-foreground">{req.message?.trim() || "No message provided."}</p>
          </div>
        )}

        {status === "pending" && req.direction === "incoming" && (
          <div className="mt-3 flex gap-2">
            <Button
              variant="success"
              size="sm"
              className="flex-1"
              onClick={() => {
                void setRequestStatus(req.id, "accepted")
                  .then(() => setFeedback("Request accepted successfully."))
                  .catch((err) => console.error("[Activity] Accept failed:", err));
              }}
            >
              Accept
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => {
                void setRequestStatus(req.id, "declined")
                  .then(() => setFeedback("Request declined."))
                  .catch((err) => console.error("[Activity] Decline failed:", err));
              }}
            >
              Decline
            </Button>
          </div>
        )}

        {status === "pending" && req.direction === "outgoing" && (
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                if (req.status !== "pending") {
                  setFeedback("Only pending requests can be cancelled.");
                  return;
                }
                setCancelled((items) => [...items, req.id]);
                setFeedback("Request cancelled successfully.");
              }}
            >
              Cancel
            </Button>
          </div>
        )}

        {status === "released" && req.direction === "outgoing" && (
          <div className="mt-3">
            <Button
              size="sm"
              className="w-full"
              onClick={() => setReviewPromptFor(req)}
            >
              Leave review
            </Button>
          </div>
        )}

        {status === "disputed" && (
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => onViewDispute?.(req.id)}
            >
              View dispute
            </Button>
          </div>
        )}

        {["accepted", "locked", "delivered"].includes(status) && (
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onOpenMessages?.(req.id)}
            >
              Message
            </Button>
            <div className="flex-1">
              <EscrowActions req={req} onReleased={(releasedReq) => setReviewPromptFor(releasedReq)} />
            </div>
          </div>
        )}
      </Card>
    );
  };

  const renderSection = (groupKey: "needsAction" | "active" | "completed" | "other", title: string) => {
    const items = groupedRequests[groupKey];
    if (items.length === 0) return null;

    return (
      <section key={groupKey} className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{title}</h2>
          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-secondary px-2 py-1 text-[10px] font-semibold text-muted-foreground">
            {items.length}
          </span>
        </div>
        <div className="space-y-3">{items.map((req) => requestCard(req))}</div>
      </section>
    );
  };

  return (
    <div className="mx-auto max-w-md pb-24">
      <div className="ps-hero-grad px-4 pb-4 pt-4 ps-safe-top">
        <h1 className="text-2xl font-bold text-foreground">My activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">A single timeline of work requests and status updates.</p>
      </div>

      <div className="space-y-5 px-4 pt-4">
        {feedback && <p role="status" className="rounded-xl bg-success-soft px-3 py-2 text-xs font-medium text-success">{feedback}</p>}

        {allRequests.length === 0 ? (
          <EmptyState
            title="No activity yet"
            message="Requests you send or receive will appear here as they move through the workflow."
            action={
              <Button size="sm" onClick={onBrowse}>
                Browse services
              </Button>
            }
          />
        ) : (
          <>
            {sectionOrder.map(({ key, title }) => renderSection(key, title))}
          </>
        )}
      </div>

      {reviewPromptFor && (
        <ReviewModal
          hireRequest={reviewPromptFor}
          onClose={() => setReviewPromptFor(null)}
          onSubmit={async (rating: number, text: string) => {
            if (!accessToken) {
              pushToast("Not authenticated", "warning");
              return;
            }
            try {
              await backendApi.reviews.create({ hireRequestId: reviewPromptFor.id, rating, text }, accessToken);
              pushToast("Thanks for your review", "success");
              setReviewPromptFor(null);
            } catch (err) {
              console.error("Failed to submit review:", err);
              pushToast("Failed to submit review", "danger");
            }
          }}
        />
      )}
    </div>
  );
}

function ReviewModal({ hireRequest, onClose, onSubmit }: { hireRequest: HireRequest; onClose: () => void; onSubmit: (rating: number, text: string) => Promise<void> }) {
  const [rating, setRating] = useState<number>(5);
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-card p-4">
        <h3 className="text-lg font-bold">Write a review for {hireRequest.providerName}</h3>
        <p className="mt-2 text-xs text-muted-foreground">Share your experience and help other customers.</p>
        <div className="mt-3 flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={n <= rating ? "ps-press rounded-md bg-primary px-3 py-1 text-white" : "ps-press rounded-md bg-secondary px-3 py-1 text-muted-foreground"}
              onClick={() => setRating(n)}
            >
              {n}★
            </button>
          ))}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} className="mt-3 w-full rounded-md border p-2 text-sm" rows={4} />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="ps-press rounded-md px-3 py-1" onClick={onClose} disabled={loading}>
            Skip
          </button>
          <button
            type="button"
            className="ps-press rounded-md bg-primary px-3 py-1 text-white"
            onClick={async () => {
              setLoading(true);
              try {
                await onSubmit(rating, text);
                onClose();
              } catch (e) {
                console.error(e);
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
          >
            {loading ? "Submitting…" : "Submit review"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: HireRequest["status"] | "cancelled" }) {
  const meta = STATUS_META[status];
  return <Pill tone={meta.tone}>{meta.label}</Pill>;
}
