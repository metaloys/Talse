"use client";

// Detail drawers. The old panel rendered `JSON.stringify(row)` for detail; these
// replace that with a structured view of one order and one user, including the
// request timeline, the conversation, the negotiation history, the audit trail
// and the money actions that used to be unreachable.

import { useState } from "react";
import { backendApi } from "@/lib/backend-api";
import { hueFromString } from "@/lib/services/data";
import { Avatar, Button, Pill } from "../ui";
import {
  ConfirmModal,
  DataTable,
  Drawer,
  Field,
  SectionHeading,
  StatusPill,
  fmtPi,
  fmtDateTime,
  fmtRelative,
  shortId,
  useAsync,
  cx,
} from "./primitives";
import type { ScreenCtx } from "./types";

const OPEN_TONE = "text-warning-foreground";

export function OrderDrawer({ orderId, onClose, ctx }: { orderId: string | null; onClose: () => void; ctx: ScreenCtx }) {
  const { data, loading, error, reload } = useAsync(
    () => backendApi.admin.getOrder(orderId!, ctx.token),
    [orderId],
    Boolean(orderId),
  );
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: "resolve"; favorProvider: boolean } | { kind: "reconcile"; favor: "provider" | "buyer" }>(null);

  const order = data?.order;
  // Money actions are limited to finance/ops/owner, mirroring the server gate on
  // /api/admin/disputes/[id]/resolve (section "escrow"). Support/readonly can
  // still read everything, but the release/refund/reconcile buttons stay hidden.
  const canMoveMoney = ["owner", "finance", "ops"].includes(ctx.role);

  const runResolve = async (reason: string) => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === "resolve") {
        await backendApi.admin.resolveDispute(orderId!, { favorProvider: confirm.favorProvider, note: reason }, ctx.token);
        ctx.notify(confirm.favorProvider ? "Released to provider." : "Refunded to buyer.", "success");
      } else {
        const res = await backendApi.admin.reconcile(orderId!, confirm.favor, ctx.token);
        ctx.notify(res.ok ? `Reconciled (${res.action}).` : `Needs manual review: ${res.error ?? "unknown"}`, res.ok ? "success" : "danger");
      }
      setConfirm(null);
      reload();
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : "Action failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Drawer
        open={Boolean(orderId)}
        onClose={onClose}
        title={order ? order.service_title ?? "Order" : "Order"}
        subtitle={order ? <span className="font-mono">{order.id}</span> : undefined}
        footer={
          order && (
            <div className="flex flex-wrap gap-2">
              {canMoveMoney && order.status === "disputed" && (
                <>
                  <Button size="sm" variant="success" onClick={() => setConfirm({ kind: "resolve", favorProvider: true })}>
                    Release to provider
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setConfirm({ kind: "resolve", favorProvider: false })}>
                    Refund buyer
                  </Button>
                </>
              )}
              {canMoveMoney && order.status === "released" && order.payout_status !== "confirmed" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: "reconcile", favor: "provider" })}>
                    Reconcile payout (provider)
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: "reconcile", favor: "buyer" })}>
                    Reconcile payout (buyer)
                  </Button>
                </>
              )}
              {!canMoveMoney && (order.status === "disputed" || (order.status === "released" && order.payout_status !== "confirmed")) && (
                <span className="text-xs text-muted-foreground">
                  Money decisions require finance, ops or owner access.
                </span>
              )}
            </div>
          )
        }
      >
        {loading && <div className="h-24 animate-pulse rounded-lg bg-secondary/60" />}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {order && (
          <div className="space-y-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusPill value={order.status} />
              <StatusPill value={`payout: ${order.payout_status ?? "n/a"}`} label={`payout: ${order.payout_status ?? "n/a"}`} />
              {order.dispute_stage && <Pill tone="warning">{order.dispute_stage}</Pill>}
              <span className="text-xs text-muted-foreground">{fmtRelative(order.created_at)}</span>
            </div>

            <Field label="Amount">{fmtPi(order.amount)}</Field>
            <Field label="Platform fee">{fmtPi(order.platform_fee)}</Field>
            <Field label="Worker payout">{fmtPi(order.worker_payout)}</Field>
            <Field label="Blockchain fee">{fmtPi(order.blockchain_fee)}</Field>
            <Field label="Buyer">{order.buyer_name ?? order.buyer_uid}</Field>
            <Field label="Provider">{order.provider_name ?? order.provider_uid}</Field>
            <Field label="Deadline">{order.deadline ?? "—"}</Field>

            <SectionHeading>Escrow</SectionHeading>
            <Field label="Lock txid" mono>{order.lock_txid ?? "—"}</Field>
            <Field label="Release txid" mono>{order.release_txid ?? "—"}</Field>
            <Field label="Refund txid" mono>{order.refund_txid ?? "—"}</Field>
            <Field label="Payout locked">{order.payout_locked_at ? fmtDateTime(order.payout_locked_at) : "—"}</Field>

            {order.dispute_reason && (
              <>
                <SectionHeading>Dispute</SectionHeading>
                <p className="text-sm font-medium text-foreground">{order.dispute_reason}</p>
                {order.dispute_details && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{order.dispute_details}</p>}
                {Array.isArray(order.dispute_evidence) && order.dispute_evidence.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {order.dispute_evidence.map((ev: string, i: number) => (
                      <li key={i} className="break-all">
                        {/^https?:\/\//.test(ev) ? (
                          <a href={ev} target="_blank" rel="noreferrer" className="text-primary underline">
                            {ev}
                          </a>
                        ) : (
                          ev
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {order.admin_note && <p className="mt-2 text-xs text-muted-foreground">Note: {order.admin_note}</p>}
              </>
            )}

            {order.attachments?.length > 0 && (
              <>
                <SectionHeading>Attachments</SectionHeading>
                <div className="flex flex-wrap gap-2">
                  {order.attachments.map((a: string, i: number) => (
                    <a key={i} href={a} target="_blank" rel="noreferrer" className="rounded-lg border border-border px-2 py-1 text-xs text-primary underline">
                      File {i + 1}
                    </a>
                  ))}
                </div>
              </>
            )}

            {(data?.offers?.length ?? 0) > 0 && (
              <>
                <SectionHeading>Negotiation</SectionHeading>
                <ul className="space-y-1 text-sm">
                  {data!.offers.map((o: any) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 border-b border-border/50 py-1 last:border-0">
                      <span className="text-muted-foreground">
                        {o.proposer_name} offered <strong className="text-foreground">{fmtPi(o.amount)}</strong>
                      </span>
                      <StatusPill value={o.status} />
                    </li>
                  ))}
                </ul>
              </>
            )}

            <SectionHeading>Conversation ({data?.messages?.length ?? 0})</SectionHeading>
            <div className="space-y-2">
              {(data?.messages ?? []).map((m: any) => (
                <div key={m.id} className="rounded-lg bg-secondary/50 p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">{m.sender_name ?? shortId(m.sender_uid)}</span>
                    <span className="text-[11px] text-muted-foreground">{fmtRelative(m.created_at)}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{m.text}</p>
                  {m.attachments?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {m.attachments.map((a: string, i: number) => (
                        <a key={i} href={a} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                          attachment {i + 1}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {!(data?.messages?.length) && <p className="text-sm text-muted-foreground">No messages.</p>}
            </div>

            {(data?.audit?.length ?? 0) > 0 && (
              <>
                <SectionHeading>Audit trail</SectionHeading>
                <ul className="space-y-1 text-xs">
                  {data!.audit.map((a: any) => (
                    <li key={a.id} className="text-muted-foreground">
                      <span className="font-medium text-foreground">{a.action}</span> · {fmtRelative(a.created_at)}
                      {a.reason ? ` · ${a.reason}` : ""}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmModal
        open={Boolean(confirm)}
        busy={busy}
        tone={confirm?.kind === "resolve" && !confirm.favorProvider ? "danger" : "primary"}
        title={
          confirm?.kind === "resolve"
            ? confirm.favorProvider
              ? "Release funds to the provider?"
              : "Refund the buyer?"
            : "Reconcile this payout lock?"
        }
        message={
          confirm?.kind === "resolve"
            ? confirm.favorProvider
              ? "This releases the full escrow (minus the platform fee) to the provider and closes the dispute."
              : "This refunds the full escrow to the buyer and closes the dispute."
            : "Reconcile checks Pi for a completed transfer and settles the record if one exists."
        }
        confirmLabel={confirm?.kind === "resolve" ? (confirm.favorProvider ? "Release funds" : "Refund buyer") : "Reconcile"}
        requireReason={confirm?.kind === "resolve"}
        onConfirm={runResolve}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

export function UserDrawer({ uid, onClose, ctx }: { uid: string | null; onClose: () => void; ctx: ScreenCtx }) {
  const { data, loading, error, reload } = useAsync(() => backendApi.admin.getUserDetail(uid!, ctx.token), [uid], Boolean(uid));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | { suspend: boolean }>(null);

  const p = data?.profile;

  const runSuspend = async (reason: string) => {
    if (!uid || !confirm) return;
    setBusy(true);
    try {
      await backendApi.admin.setUserSuspended(uid, confirm.suspend, reason, ctx.token);
      ctx.notify(confirm.suspend ? "Account suspended." : "Account restored.", "success");
      setConfirm(null);
      reload();
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : "Action failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  const isSuspended = Boolean(p?.suspended_at);
  // Suspending/restoring is moderation: owner or ops only, matching the server
  // gate on PATCH /api/admin/users/[id] (section "trust").
  const canModerate = ["owner", "ops"].includes(ctx.role);

  return (
    <>
      <Drawer
        open={Boolean(uid)}
        onClose={onClose}
        title={p ? p.display_name || p.username || shortId(p.pi_uid) : "User"}
        subtitle={p ? <span className="font-mono">{p.pi_uid}</span> : undefined}
        footer={
          p &&
          (canModerate ? (
            <Button size="sm" variant={isSuspended ? "success" : "danger"} onClick={() => setConfirm({ suspend: !isSuspended })}>
              {isSuspended ? "Restore account" : "Suspend account"}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Suspending accounts requires owner or ops access.</span>
          ))
        }
      >
        {loading && <div className="h-24 animate-pulse rounded-lg bg-secondary/60" />}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {p && (
          <div className="space-y-1">
            <div className="mb-3 flex items-center gap-3">
              <Avatar name={p.display_name || p.username || "?"} hue={hueFromString(p.pi_uid)} size={44} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{p.display_name || p.username}</span>
                  {isSuspended && <Pill tone="danger">Suspended</Pill>}
                </div>
                <span className="text-xs text-muted-foreground">joined {fmtRelative(p.created_at)}</span>
              </div>
            </div>

            <Field label="Rating">{(Number(p.rating_avg) || 0).toFixed(1)} ({p.rating_count ?? 0})</Field>
            <Field label="Completed jobs">{p.jobs_completed ?? 0}</Field>
            <Field label="Refunds against">{p.refunds_against_provider ?? 0}</Field>
            <Field label="Total earned">{fmtPi(p.total_earned)}</Field>
            <Field label="Listings">{p.active_listings ?? 0} active / {p.listings_count ?? 0}</Field>
            <Field label="Orders buyer / provider">{p.orders_as_buyer ?? 0} / {p.orders_as_provider ?? 0}</Field>
            <Field label="Boost spend">{fmtPi(p.boost_spend)}</Field>
            <Field label="Reports filed / against">{p.reports_filed ?? 0} / {p.reports_against ?? 0}</Field>
            <Field label="Wallet" mono>{p.wallet_address ?? "—"}</Field>
            {p.suspension_reason && <Field label="Suspension reason">{p.suspension_reason}</Field>}

            <SectionHeading>Listings ({data?.listings?.length ?? 0})</SectionHeading>
            <DataTable
              columns={[
                { key: "title", header: "Title" },
                { key: "price", header: "Price", align: "right", render: (r: any) => fmtPi(r.price) },
                { key: "active", header: "State", render: (r: any) => <StatusPill value={r.active ? "active" : "inactive"} /> },
              ]}
              rows={data?.listings ?? []}
              rowKey={(r: any) => r.id}
              emptyTitle="No listings"
            />

            <SectionHeading>Recent orders as provider ({data?.ordersAsProvider?.length ?? 0})</SectionHeading>
            <DataTable
              columns={[
                { key: "id", header: "Order", render: (r: any) => <span className="font-mono text-xs">{shortId(r.id)}</span> },
                { key: "amount", header: "Amount", align: "right", render: (r: any) => fmtPi(r.amount) },
                { key: "status", header: "Status", render: (r: any) => <StatusPill value={r.status} /> },
              ]}
              rows={(data?.ordersAsProvider ?? []).slice(0, 8)}
              rowKey={(r: any) => r.id}
              onRowClick={(r: any) => ctx.openOrder(r.id)}
              emptyTitle="No orders"
            />

            {(data?.reportsAgainst?.length ?? 0) > 0 && (
              <>
                <SectionHeading>Reports against</SectionHeading>
                <ul className="space-y-1 text-sm">
                  {data!.reportsAgainst.map((r: any) => (
                    <li key={r.id} className={cx("flex items-center justify-between", OPEN_TONE)}>
                      <span className="text-muted-foreground">{r.reason}</span>
                      <StatusPill value={r.status} />
                    </li>
                  ))}
                </ul>
              </>
            )}

            {(data?.reviews?.length ?? 0) > 0 && (
              <>
                <SectionHeading>Reviews</SectionHeading>
                <ul className="space-y-1 text-sm">
                  {data!.reviews.map((r: any) => (
                    <li key={r.id} className="border-b border-border/50 py-1 last:border-0">
                      <span className="font-semibold text-foreground">{r.rating}★</span>{" "}
                      <span className="text-muted-foreground">{r.text}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmModal
        open={Boolean(confirm)}
        busy={busy}
        tone={confirm?.suspend ? "danger" : "success"}
        title={confirm?.suspend ? "Suspend this account?" : "Restore this account?"}
        requireReason={confirm?.suspend}
        reasonLabel="Suspension reason"
        confirmLabel={confirm?.suspend ? "Suspend" : "Restore"}
        onConfirm={runSuspend}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
