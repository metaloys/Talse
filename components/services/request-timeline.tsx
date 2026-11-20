"use client";

import { formatDate, type HireRequest } from "@/lib/services/data";
import { cx } from "./ui";
import { IconCheck, IconFlag } from "./icons";

type Step = { key: string; label: string; hint: string };

const FLOW: Step[] = [
  { key: "pending", label: "Request sent", hint: "Waiting for the provider to accept." },
  { key: "accepted", label: "Accepted", hint: "Agree the scope and timeline in Messages first." },
  { key: "locked", label: "Pi held in escrow", hint: "The payment is held safely until you confirm delivery." },
  { key: "delivered", label: "Delivered", hint: "Check the work, then confirm to release the payment." },
  { key: "released", label: "Payment released", hint: "The provider has received the funds." },
];

const TERMINAL: Record<string, { label: string; hint: string; tone: "danger" | "warning" }> = {
  declined: { label: "Declined", hint: "The provider declined this request. Nothing was charged.", tone: "danger" },
  cancelled: { label: "Cancelled", hint: "This request was cancelled before any payment.", tone: "danger" },
  refunded: { label: "Refunded", hint: "The escrow was returned to the buyer.", tone: "warning" },
};

/**
 * Where the money is. Rendered inside an expanded activity card, this answers
 * the only question users ask when real Pi is held: what happens next, and to
 * whom.
 */
export function RequestTimeline({ req }: { req: HireRequest }) {
  const terminal = TERMINAL[req.status];

  if (terminal) {
    return (
      <div className="rounded-xl border border-border bg-secondary/40 p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive-soft text-destructive">
            <IconCheck size={12} />
          </span>
          <p className="text-xs font-bold text-foreground">{terminal.label}</p>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{terminal.hint}</p>
      </div>
    );
  }

  const disputed = req.status === "disputed";
  const currentIndex = disputed ? 3 : Math.max(0, FLOW.findIndex((s) => s.key === req.status));

  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-foreground">Where this stands</p>
        <span className="text-[11px] text-muted-foreground">
          Started {formatDate(new Date(req.createdAt).toISOString().slice(0, 10))}
        </span>
      </div>

      <ol className="space-y-2">
        {FLOW.map((step, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          const isDisputeStep = disputed && i === 3;
          const last = i === FLOW.length - 1;

          return (
            <li key={step.key} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <span
                  className={cx(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                    done && "border-primary bg-primary text-primary-foreground",
                    current && !isDisputeStep && "border-primary bg-card text-primary ring-2 ring-primary/25",
                    isDisputeStep && "border-destructive bg-destructive-soft text-destructive",
                    !done && !current && "border-border bg-card text-muted-foreground",
                  )}
                >
                  {done ? <IconCheck size={11} /> : isDisputeStep ? <IconFlag size={11} /> : i + 1}
                </span>
                {!last && (
                  <span
                    className={cx("mt-0.5 w-px flex-1", done ? "bg-primary/40" : "bg-border")}
                    aria-hidden="true"
                  />
                )}
              </div>
              <div className={cx("min-w-0 pb-1", !done && !current && "opacity-60")}>
                <p
                  className={cx(
                    "text-[11px] font-semibold",
                    isDisputeStep ? "text-destructive" : current ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {isDisputeStep ? "Disputed" : step.label}
                </p>
                {(current || (done && last)) && (
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {isDisputeStep
                      ? "An admin is reviewing both sides. Funds stay in escrow until it is resolved."
                      : step.hint}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
