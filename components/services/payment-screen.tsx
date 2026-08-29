"use client";

import { useState } from "react";
import { DEMO_PAYMENTS } from "@/lib/services/demo-data";
import { formatPi } from "@/lib/services/data";
import { Button, Card, EmptyState, Field, Pill, TextInput } from "./ui";
import { IconWallet } from "./icons";

export function PaymentScreen() {
  const [view, setView] = useState<"summary" | "history">("summary");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [reference, setReference] = useState("");
  const [referenceError, setReferenceError] = useState("");

  const submitReference = () => {
    if (!reference.trim()) {
      setReferenceError("Add a reference to preview this future payment record.");
      return;
    }
    setReferenceError("");
    setState("loading");
    window.setTimeout(() => setState("success"), 450);
  };

  return (
    <div className="space-y-3">
      <div className="flex rounded-xl bg-secondary p-1">
        <button type="button" onClick={() => setView("summary")} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${view === "summary" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>Payment summary</button>
        <button type="button" onClick={() => setView("history")} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${view === "history" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>History</button>
      </div>
      <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning-foreground">Future integration only. No payment is being processed, and no wallet credentials are requested or stored.</p>
      {view === "summary" ? (
        <>
          <Card className="p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer view</p><h3 className="mt-1 text-lg font-bold text-foreground">Website review</h3></div><Pill tone="neutral">Preview</Pill></div>
            <div className="mt-4 grid grid-cols-2 gap-2"><Info label="Amount" value={formatPi(30)} /><Info label="Currency" value="Pi" /><Info label="Job status" value="Not started" /><Info label="Provider" value="Kato Mensah" /></div>
            <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground"><p>Payment status: <span className="font-semibold text-foreground">Not enabled</span></p><p className="mt-1">Transaction and reference details will be supplied by the future backend.</p></div>
          </Card>
          <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Provider status</p><div className="mt-2 flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-foreground">Awaiting official payments</p><p className="mt-1 text-xs text-muted-foreground">Funds are not held, sent, or received here.</p></div><Pill tone="warning">Pending setup</Pill></div></Card>
          <Card className="p-4"><Field label="Transaction/reference placeholder" htmlFor="payment-reference" hint="Frontend-only field for a future transaction reference." error={referenceError}><TextInput id="payment-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. future-ref-123" /></Field><Button className="mt-3 w-full" onClick={submitReference} disabled={state === "loading"}>{state === "loading" ? "Saving preview…" : "Save preview reference"}</Button>{state === "success" && <p role="status" className="mt-2 rounded-lg bg-success-soft px-3 py-2 text-xs font-medium text-success">Preview reference saved for this screen session only.</p>}{state === "error" && <p role="alert" className="mt-2 rounded-lg bg-destructive-soft px-3 py-2 text-xs font-medium text-destructive">Unable to save the preview reference. Try again.</p>}</Card>
        </>
      ) : DEMO_PAYMENTS.length === 0 ? <EmptyState icon={<IconWallet size={26} />} title="No payment history" message="Payment records will appear after the official integration is available." /> : <div className="space-y-2">{DEMO_PAYMENTS.map((payment) => <Card key={payment.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-foreground">{payment.label}</p><p className="mt-1 text-xs text-muted-foreground">Reference: not available · {payment.note}</p></div><Pill tone="neutral">{payment.status}</Pill></div><p className="mt-3 text-lg font-bold text-primary">{formatPi(payment.amount)}</p></Card>)}</div>}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-secondary/60 p-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold text-foreground">{value}</p></div>; }
