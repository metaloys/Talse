"use client";

import { useState } from "react";
import { DEMO_REPUTATION, DEMO_REVIEWS } from "@/lib/services/demo-data";
import { Button, Card, EmptyState, Field, Pill, TextArea } from "./ui";

export function ReviewsScreen() {
  const [view, setView] = useState<"list" | "write">("list");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [selected, setSelected] = useState<string | null>(null);
  const reviewed = DEMO_REVIEWS.some((review) => review.mine && review.rating > 0);

  const submit = () => {
    if (!rating || comment.trim().length < 10) {
      setState("error");
      return;
    }
    setState("loading");
    window.setTimeout(() => setState("success"), 500);
  };

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs text-muted-foreground">Reputation summary</p><p className="mt-1 text-xl font-bold text-foreground">{DEMO_REPUTATION.rating}</p><p className="mt-1 text-xs text-muted-foreground">{DEMO_REPUTATION.completed} completed jobs · {DEMO_REPUTATION.score}</p></div>
          <Pill tone="neutral">No guarantee</Pill>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{DEMO_REPUTATION.note}</p>
      </Card>
      {view === "write" ? (
        <Card className="space-y-4 p-4">
          <div><h3 className="text-sm font-bold text-foreground">Write a review</h3><p className="mt-1 text-xs text-muted-foreground">Reviews are available after a completed job.</p></div>
          {reviewed ? <EmptyState title="Already reviewed" message="You have already submitted a review for this job." /> : <>
            <Field label="Rating" htmlFor="review-rating"><div id="review-rating" className="flex gap-1" role="radiogroup" aria-label="Rating"><>{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" role="radio" aria-checked={rating === value} onClick={() => { setRating(value); setState("idle"); }} className="text-2xl text-primary">{value <= rating ? "★" : "☆"}</button>)}</></div></Field>
            <Field label="Comment" htmlFor="review-comment" counter={`${comment.length}/600`}><TextArea id="review-comment" value={comment} maxLength={600} rows={4} onChange={(event) => { setComment(event.target.value); setState("idle"); }} placeholder="Share useful feedback (at least 10 characters)" /></Field>
            {state === "error" && <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-xs text-destructive">Choose a rating and write at least 10 characters.</p>}
            {state === "success" && <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-xs text-success">Review submitted in this frontend demo.</p>}
            <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setView("list")}>Cancel</Button><Button className="flex-1" disabled={state === "loading" || state === "success"} onClick={submit}>{state === "loading" ? "Submitting…" : "Submit review"}</Button></div>
          </>}
        </Card>
      ) : <>
        <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-foreground">Reviews</h3><Button size="sm" variant="outline" onClick={() => setView("write")}>Write review</Button></div>
        {DEMO_REVIEWS.length === 0 ? <EmptyState title="No reviews yet" message="Completed-job reviews will appear here." /> : DEMO_REVIEWS.map((review) => <Card key={review.id} className="p-4"><button type="button" className="w-full text-left" onClick={() => setSelected(selected === review.id ? null : review.id)}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-foreground">{review.name}</p><p className="text-xs text-muted-foreground">{review.service}</p></div><span className="text-primary">{review.rating ? `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}` : "Not rated"}</span></div><p className="mt-2 text-sm text-foreground">{review.text}</p></button>{selected === review.id && <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground"><p>Review ID: {review.id}</p><p className="mt-1">Reviewer and reviewed-user IDs will be linked when backend data is available.</p><p className="mt-1">Job ID: related completed job</p></div>}</Card>)}
      </>}
      <p className="text-[11px] text-muted-foreground">Frontend-only demo data. Ratings and reputation are not shared or persistent.</p>
    </div>
  );
}
