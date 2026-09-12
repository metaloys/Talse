"use client";

import { useEffect, useMemo, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { useServices } from "@/contexts/services-context";
import { backendApi } from "@/lib/backend-api";
import { timeAgo } from "@/lib/services/data";
import { Button, Card, EmptyState, Field, Pill, TextArea } from "./ui";

type ReviewRow = {
  id: string;
  reviewer_uid?: string;
  reviewer_name?: string;
  reviewer?: { display_name?: string; username?: string } | null;
  provider_uid?: string;
  rating: number;
  text?: string | null;
  created_at?: string;
  service_title?: string;
  serviceTitle?: string;
  hire_request?: { service_title?: string; serviceTitle?: string; title?: string; service?: { title?: string } } | null;
};

export function ReviewsScreen({ providerUid: explicitProviderUid }: { providerUid?: string }) {
  const { accessToken, piUser } = usePiAuth();
  const { requests } = useServices();
  const providerUid = explicitProviderUid ?? piUser?.uid ?? null;
  const isOwnProfile = !!providerUid && providerUid === piUser?.uid;
  const [view, setView] = useState<"list" | "write">("list");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [selected, setSelected] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [profileSummary, setProfileSummary] = useState({ ratingAvg: 0, ratingCount: 0 });
  const [reviewsError, setReviewsError] = useState<string | null>(null);

  const reviewableHireRequest = useMemo(
    () => requests.find((request) => request.status === "released" && request.providerPiId === providerUid && request.requesterPiId === piUser?.uid) ?? null,
    [providerUid, piUser?.uid, requests],
  );

  const reviewed = reviews.some((review) => review.reviewer_uid === piUser?.uid);

  const refreshReviews = async () => {
    if (!providerUid) return;
    try {
      const data = await backendApi.reviews.listForProvider(providerUid, isOwnProfile);
      setReviews(data.reviews ?? []);
      setReviewsError(null);
    } catch (error) {
      setReviewsError(error instanceof Error ? error.message : "Could not load reviews.");
    }
  };

  useEffect(() => {
    if (isOwnProfile) {
      setView("list");
    }
  }, [isOwnProfile]);

  useEffect(() => {
    let cancelled = false;

    const loadProfileSummary = async () => {
      if (!providerUid) return;
      try {
        const res = await fetch(`/api/profile?uid=${encodeURIComponent(providerUid)}`);
        const data = await res.json();
        if (!res.ok || cancelled) return;
        const ratingAvg = Number(data?.rating_avg ?? data?.ratingAvg ?? 0);
        const ratingCount = Number(data?.rating_count ?? data?.ratingCount ?? 0);
        setProfileSummary({ ratingAvg: Number.isFinite(ratingAvg) ? ratingAvg : 0, ratingCount: Number.isFinite(ratingCount) ? ratingCount : 0 });
      } catch {
        if (!cancelled) setProfileSummary({ ratingAvg: 0, ratingCount: 0 });
      }
    };

    void loadProfileSummary();
    void refreshReviews();
    return () => { cancelled = true; };
  }, [providerUid]);

  const distribution = useMemo(() => {
    return [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: reviews.filter((review) => Number(review.rating) === star).length,
    }));
  }, [reviews]);
  const maxDistributionCount = Math.max(...distribution.map((item) => item.count), 1);

  const submit = async () => {
    if (!rating || comment.trim().length < 10) {
      setState("error");
      return;
    }
    if (!accessToken || !reviewableHireRequest) {
      setState("error");
      return;
    }
    setState("loading");
    try {
      await backendApi.reviews.create({ hireRequestId: reviewableHireRequest.id, rating, text: comment.trim() }, accessToken);
      setComment("");
      setRating(0);
      setView("list");
      setState("success");
      await refreshReviews();
    } catch (error) {
      setState("error");
      const message = error instanceof Error ? error.message : "Could not submit review.";
      setReviewsError(message);
    }
  };

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Reputation summary</p>
            <p className="mt-1 text-xl font-bold text-foreground">{profileSummary.ratingAvg ? profileSummary.ratingAvg.toFixed(1) : "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{profileSummary.ratingCount} reviews</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {distribution.map((item) => (
            <div key={item.star} className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="w-5 text-right font-medium text-foreground">{item.star}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(item.count / maxDistributionCount) * 100}%` }}
                />
              </div>
              <span className="w-4 text-right">{item.count}</span>
            </div>
          ))}
        </div>
      </Card>
      {view === "write" && !isOwnProfile ? (
        <Card className="space-y-4 p-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Write a review</h3>
            <p className="mt-1 text-xs text-muted-foreground">Reviews are available after a completed job.</p>
          </div>
          {reviewed ? (
            <EmptyState title="Already reviewed" message="You have already submitted a review for this job." />
          ) : (
            <>
              <Field label="Rating" htmlFor="review-rating">
                <div id="review-rating" className="flex gap-1" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={rating === value}
                      onClick={() => {
                        setRating(value);
                        setState("idle");
                      }}
                      className="text-2xl text-primary"
                    >
                      {value <= rating ? "★" : "☆"}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Comment" htmlFor="review-comment" counter={`${comment.length}/600`}>
                <TextArea
                  id="review-comment"
                  value={comment}
                  maxLength={600}
                  rows={4}
                  onChange={(event) => {
                    setComment(event.target.value);
                    setState("idle");
                  }}
                  placeholder="Share useful feedback (at least 10 characters)"
                />
              </Field>
              {state === "error" && (
                <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-xs text-destructive">
                  {reviewsError ?? "Choose a rating and write at least 10 characters."}
                </p>
              )}
              {state === "success" && (
                <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-xs text-success">
                  Review submitted successfully.
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setView("list")}>Cancel</Button>
                <Button className="flex-1" disabled={state === "loading" || state === "success"} onClick={() => { void submit(); }}>
                  {state === "loading" ? "Submitting…" : "Submit review"}
                </Button>
              </div>
            </>
          )}
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Reviews</h3>
            {!isOwnProfile && (
              <Button size="sm" variant="outline" onClick={() => setView("write")}>Write review</Button>
            )}
          </div>
          {reviewsError && (
            <p className="rounded-lg bg-destructive-soft px-3 py-2 text-xs text-destructive">{reviewsError}</p>
          )}
          {reviews.length === 0 ? (
            <EmptyState title="No reviews yet" message="Completed-job reviews will appear here." />
          ) : (
            reviews.map((review) => {
              const serviceLabel = review.service_title ?? review.serviceTitle ?? review.hire_request?.service_title ?? review.hire_request?.serviceTitle ?? review.hire_request?.title ?? review.hire_request?.service?.title ?? "Service review";
              const reviewerName = review.reviewer_name ?? review.reviewer?.display_name ?? review.reviewer?.username ?? "Anonymous";
              const createdAt = review.created_at ? new Date(review.created_at).getTime() : Date.now();
              return (
                <Card key={review.id} className="p-4">
                  <button type="button" className="w-full text-left" onClick={() => setSelected(selected === review.id ? null : review.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{reviewerName}</p>
                        <p className="text-xs text-muted-foreground">{serviceLabel}</p>
                      </div>
                      <span className="text-primary">{review.rating ? `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}` : "Not rated"}</span>
                    </div>
                    <p className="mt-2 text-sm text-foreground">{review.text || "No comment left."}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">{timeAgo(createdAt)}</p>
                  </button>
                  {selected === review.id && (
                    <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                      <p>Reviewed {timeAgo(createdAt)}</p>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
