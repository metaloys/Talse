"use client";

import { useMemo, useState, useEffect } from "react";
import { STATUS_META, formatPi, timeAgo, type HireRequest } from "@/lib/services/data";
import { backendApi } from "@/lib/backend-api";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { useServices } from "@/contexts/services-context";
import { Button, Card, cx, EmptyState, Pill, TextArea } from "./ui";
import { EscrowActions } from "./escrow-actions";
import { Overlay } from "./feedback";
import { RequestTimeline } from "./request-timeline";
import { IconStar } from "./icons";

export function ActivityScreen({ onBrowse, initialOpenRequestId, onOpenMessages, onViewDispute }: { onBrowse: () => void; initialOpenRequestId?: string | null; onOpenMessages?: (requestId: string) => void; onViewDispute?: (requestId: string) => void }) {
  const { outgoing, incoming, setRequestStatus, pushToast, requests } = useServices();
  const { accessToken } = usePiAuth();
  const [openRequest, setOpenRequest] = useState<string | null>(null);
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
      const status = req.status;
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
  }, [allRequests]);

  const sectionOrder = [
    { key: "needsAction", title: "Needs action" },
    { key: "active", title: "Active" },
    { key: "completed", title: "Completed" },
    { key: "other", title: "Other" },
  ] as const;

  const requestCard = (req: HireRequest) => {
    const status = req.status;
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

          {!cardExpanded && (
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-foreground">
              {req.message?.trim() ? req.message.trim().replace(/\s+/g, " ") : "No message provided."}
            </p>
          )}
        </button>

        {cardExpanded && (
          <div className="mt-3 space-y-2">
            <RequestTimeline req={req} />
            <div className="rounded-xl bg-secondary/60 p-3 text-sm text-foreground">
              <p className="whitespace-pre-wrap leading-relaxed text-foreground">{req.message?.trim() || "No message provided."}</p>
            </div>
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
                  .then(() => pushToast("Request accepted", "success"))
                  .catch((err) => {
                    console.error("[Activity] Accept failed:", err);
                    pushToast("Could not accept this request. Please try again.", "danger");
                  });
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
                  .then(() => pushToast("Request declined", "info"))
                  .catch((err) => {
                    console.error("[Activity] Decline failed:", err);
                    pushToast("Could not decline this request. Please try again.", "danger");
                  });
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
                  pushToast("Only pending requests can be cancelled.", "warning");
                  return;
                }
                void setRequestStatus(req.id, "declined")
                  .then(() => pushToast("Request cancelled", "info"))
                  .catch((err) => {
                    console.error("[Activity] Cancel failed:", err);
                    pushToast("Could not cancel this request. Please try again.", "danger");
                  });
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

function ReviewModal({
  hireRequest,
  onClose,
  onSubmit,
}: {
  hireRequest: HireRequest;
  onClose: () => void;
  onSubmit: (rating: number, text: string) => Promise<void>;
}) {
  const [rating, setRating] = useState<number>(5);
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const labels = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

  return (
    <Overlay
      open
      onClose={() => (loading ? undefined : onClose())}
      title="Leave a review"
    >
      <div className="mx-auto max-w-md space-y-5 p-4 pb-28">
        <div>
          <p className="ps-eyebrow">Completed request</p>
          <p className="mt-1 text-sm text-muted-foreground">
            How was working with <span className="font-semibold text-foreground">{hireRequest.providerName}</span>?
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-center gap-1.5" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                onClick={() => setRating(n)}
                className="ps-press rounded-lg p-1.5"
              >
                <IconStar
                  size={30}
                  filled={n <= rating}
                  className={cx(n <= rating ? "text-accent-foreground" : "text-border")}
                />
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-xs font-semibold text-muted-foreground">{labels[rating]}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="review-text" className="text-sm font-semibold text-foreground">
            What should other buyers know?
          </label>
          <TextArea
            id="review-text"
            rows={4}
            maxLength={600}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Was the work delivered as agreed? Anything worth mentioning?"
          />
          <p className="text-right text-xs text-muted-foreground ps-nums">{text.length}/600</p>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Reviews are public and can only be left once for a completed request.
        </p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 px-4 py-3 ps-safe-bottom backdrop-blur">
        <div className="mx-auto flex max-w-md gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
            Not now
          </Button>
          <Button
            className="flex-1"
            onClick={async () => {
              setLoading(true);
              try {
                await onSubmit(rating, text);
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
          >
            {loading ? "Submitting…" : "Submit review"}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}

function StatusPill({ status }: { status: HireRequest["status"] | "cancelled" }) {
  const meta = STATUS_META[status];
  return <Pill tone={meta.tone}>{meta.label}</Pill>;
}
