"use client";

import { useEffect, useMemo, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { useServices } from "@/contexts/services-context";
import { backendApi } from "@/lib/backend-api";
import { hueFromString, timeAgo } from "@/lib/services/data";
import { Avatar, Button, Card, EmptyState, Field, Pill, Stars, TextArea } from "./ui";
import { IconStar } from "./icons";
import { track } from "@/lib/analytics";

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

function serviceLabelFor(review: ReviewRow): string {
  return (
    review.service_title ??
    review.serviceTitle ??
    review.hire_request?.service_title ??
    review.hire_request?.serviceTitle ??
    review.hire_request?.title ??
    review.hire_request?.service?.title ??
    "Service review"
  );
}

function reviewerNameFor(review: ReviewRow): string {
  return review.reviewer_name ?? review.reviewer?.display_name ?? review.reviewer?.username ?? "Anonymous";
}

export function ReviewsScreen({ providerUid: explicitProviderUid }: { providerUid?: string }) {
  const { accessToken, piUser } = usePiAuth();
  const { requests } = useServices();
  const providerUid = explicitProviderUid ?? piUser?.uid ?? null;
  const isOwnProfile = !!providerUid && providerUid === piUser?.uid;
  const [view, setView] = useState<"list" | "write">("list");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerUid]);

  const distribution = useMemo(() => {
    return [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: reviews.filter((review) => Number(review.rating) === star).length,
    }));
  }, [reviews]);

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
      track("review_submitted", { hire_request_id: reviewableHireRequest.id, rating });
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
    <div className="space-y-4">
      {/* summary */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-5">
          <div className="text-center">
            <p className="text-4xl font-extrabold leading-none text-foreground ps-nums">
              {profileSummary.ratingAvg ? profileSummary.ratingAvg.toFixed(1) : "—"}
            </p>
            <Stars value={profileSummary.ratingAvg} size={15} className="mt-2" />
            <p className="mt-1 text-xs text-muted-foreground">
              {profileSummary.ratingCount} review{profileSummary.ratingCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="min-w-[180px] flex-1 space-y-1.5">
            {distribution.map((item) => {
              const pct = profileSummary.ratingCount
                ? (item.count / profileSummary.ratingCount) * 100
                : 0;
              return (
                <div key={item.star} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="w-3 text-right font-semibold text-foreground ps-nums">{item.star}</span>
                  <IconStar size={11} filled className="text-accent" />
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-6 text-right ps-nums">{item.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {view === "write" && !isOwnProfile ? (
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-foreground">Write a review</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Reviews are available after a completed job.</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setView("list")}>
              Cancel
            </Button>
          </div>
          {reviewed ? (
            <EmptyState title="Already reviewed" message="You have already submitted a review for this job." />
          ) : (
            <>
              <Field label="Rating" htmlFor="review-rating">
                <div id="review-rating" className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={rating === value}
                      aria-label={`${value} star${value === 1 ? "" : "s"}`}
                      onClick={() => {
                        setRating(value);
                        setState("idle");
                      }}
                      className="ps-press rounded-lg p-0.5"
                    >
                      <IconStar size={30} filled={value <= rating} className={value <= rating ? "text-accent" : "text-border"} />
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
                  {state === "loading" ? "Submitting..." : "Submit review"}
                </Button>
              </div>
            </>
          )}
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-foreground">
              Reviews{reviews.length > 0 ? ` (${reviews.length})` : ""}
            </h3>
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
            <div className="grid gap-3 sm:grid-cols-2">
              {reviews.map((review) => {
                const reviewerName = reviewerNameFor(review);
                const createdAt = review.created_at ? new Date(review.created_at).getTime() : Date.now();
                return (
                  <Card key={review.id} className="flex flex-col gap-2 p-4">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={reviewerName} hue={hueFromString(reviewerName)} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="ps-clamp-1 text-sm font-semibold text-foreground">{reviewerName}</p>
                        <p className="ps-clamp-1 text-xs text-muted-foreground">{serviceLabelFor(review)}</p>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(createdAt)}</span>
                    </div>
                    <Stars value={Number(review.rating) || 0} size={13} />
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {review.text || "No comment left."}
                    </p>
                    {Number(review.rating) >= 5 && <Pill tone="success" className="self-start text-[10px]">Top rated</Pill>}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
