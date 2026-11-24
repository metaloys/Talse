"use client";

// Operations group: Orders, Escrow & Payouts, Payments, Offers & Negotiations.

import { useState } from "react";
import { backendApi, downloadAdminExport } from "@/lib/backend-api";
import { Button, Card } from "../ui";
import {
  DataTable,
  FilterChips,
  Kpi,
  Pagination,
  SearchInput,
  SectionHeading,
  StatusPill,
  fmtDateTime,
  fmtPi,
  fmtRelative,
  shortId,
  useAsync,
} from "./primitives";
import type { ScreenCtx } from "./types";

const ORDER_STATUSES = [
  { id: "all", label: "All" },
  { id: "locked", label: "Locked" },
  { id: "delivered", label: "Delivered" },
  { id: "disputed", label: "Disputed" },
  { id: "released", label: "Released" },
  { id: "refunded", label: "Refunded" },
  { id: "cancelled", label: "Cancelled" },
];

export function OrdersScreen({ ctx }: { ctx: ScreenCtx }) {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: string; order: "asc" | "desc" }>({ key: "created_at", order: "desc" });

  const { data, loading, error, reload } = useAsync(
    () => backendApi.admin.listOrders({ status, search, page, perPage: 25, sort: sort.key, order: sort.order }, ctx.token),
    [status, search, page, sort.key, sort.order],
  );

  const counts = data?.statusCounts ?? {};
  const chips = ORDER_STATUSES.map((s) => ({ ...s, count: s.id === "all" ? undefined : counts[s.id] }));

  const onSort = (key: string) => setSort((s) => (s.key === key ? { key, order: s.order === "asc" ? "desc" : "asc" } : { key, order: "desc" }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">Orders</h1>
          <p className="text-xs text-muted-foreground">Every hire request, with the full money breakdown</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => downloadAdminExport("orders", ctx.token, { status, range: "all" }).catch((e) => ctx.notify(e.message, "danger"))}
        >
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search id, listing, buyer, provider…" />
        <FilterChips options={chips} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
      </div>

      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}

      <DataTable
        columns={[
          { key: "id", header: "Order", render: (r: any) => <span className="font-mono text-xs">{shortId(r.id)}</span> },
          { key: "service_title", header: "Listing", render: (r: any) => r.service_title ?? "—" },
          { key: "parties", header: "Parties", render: (r: any) => <span className="text-xs">{(r.buyer_name ?? "?") + " → " + (r.provider_name ?? "?")}</span> },
          { key: "amount", header: "Amount", align: "right", sortKey: "amount", render: (r: any) => fmtPi(r.amount) },
          { key: "platform_fee", header: "Fee", align: "right", render: (r: any) => fmtPi(r.platform_fee) },
          { key: "status", header: "Status", render: (r: any) => <StatusPill value={r.status} /> },
          { key: "payout_status", header: "Payout", render: (r: any) => <StatusPill value={r.payout_status ?? "none"} /> },
          { key: "message_count", header: "Msgs", align: "center", render: (r: any) => r.message_count ?? 0 },
          { key: "created_at", header: "Created", sortKey: "created_at", render: (r: any) => fmtRelative(r.created_at) },
        ]}
        rows={data?.orders ?? []}
        rowKey={(r: any) => r.id}
        loading={loading}
        onRowClick={(r: any) => ctx.openOrder(r.id)}
        sort={sort}
        onSort={onSort}
        emptyTitle="No orders"
        emptyHint="Orders appear here as soon as a buyer hires a provider."
      />
      <Pagination page={page} perPage={25} count={data?.count ?? 0} onPage={setPage} />
    </div>
  );
}

export function EscrowScreen({ ctx }: { ctx: ScreenCtx }) {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsync(() => backendApi.admin.listEscrow({ page, perPage: 25 }, ctx.token), [page]);
  const [busy, setBusy] = useState<string | null>(null);

  const reconcile = async (id: string, favor: "provider" | "buyer") => {
    setBusy(id + favor);
    try {
      const res = await backendApi.admin.reconcile(id, favor, ctx.token);
      ctx.notify(res.ok ? `Reconciled (${res.action}).` : `Manual review: ${res.error ?? "unknown"}`, res.ok ? "success" : "danger");
      reload();
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : "Reconcile failed", "danger");
    } finally {
      setBusy(null);
    }
  };

  const wallet = data?.wallet;

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-bold text-foreground">Escrow &amp; Payouts</h1>
        <p className="text-xs text-muted-foreground">Money held, settled, and stuck</p>
      </div>

      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="In flight (liability)" value={fmtPi(data?.inFlight?.total)} hint={`${data?.inFlight?.openJobs ?? 0} open jobs`} />
        <Kpi label="Payouts confirmed" value={data?.payoutSummary?.confirmed ?? 0} />
        <Kpi label="Payouts pending" value={data?.payoutSummary?.pending ?? 0} />
        <Kpi label="Wallet lease" value={wallet?.locked ? "held" : "free"} hint={wallet?.locked ? String(wallet.owner ?? "") : "available"} />
      </div>

      {(data?.stuckPayouts?.length ?? 0) > 0 && (
        <Card className="border-warning/40 p-4">
          <SectionHeading>Stuck payout locks</SectionHeading>
          <p className="mb-2 text-xs text-muted-foreground">Released orders whose payout never confirmed. Reconcile settles the record if Pi shows a completed transfer.</p>
          <div className="space-y-2">
            {data!.stuckPayouts.map((s: any) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2">
                <div className="text-xs text-muted-foreground">
                  locked {fmtDateTime(s.payout_locked_at)} · status {s.status} · payout {s.payout_status ?? "none"}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={busy === s.id + "provider"} onClick={() => reconcile(s.id, "provider")}>
                    Reconcile → provider
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === s.id + "buyer"} onClick={() => reconcile(s.id, "buyer")}>
                    Reconcile → buyer
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <SectionHeading>Accounting ledger</SectionHeading>
      <DataTable
        columns={[
          { key: "id", header: "Order", render: (r: any) => <span className="font-mono text-xs">{shortId(r.id)}</span> },
          { key: "created_at", header: "Date", render: (r: any) => fmtDateTime(r.created_at) },
          { key: "amount", header: "Gross", align: "right", render: (r: any) => fmtPi(r.amount) },
          { key: "platform_fee", header: "Fee", align: "right", render: (r: any) => fmtPi(r.platform_fee) },
          { key: "worker_payout", header: "Payout", align: "right", render: (r: any) => fmtPi(r.worker_payout) },
          { key: "blockchain_fee", header: "Network", align: "right", render: (r: any) => fmtPi(r.blockchain_fee) },
          { key: "platform_net", header: "Net", align: "right", render: (r: any) => <span className="font-semibold">{fmtPi(r.platform_net)}</span> },
          { key: "accounting_status", header: "State", render: (r: any) => <StatusPill value={r.accounting_status} /> },
          { key: "release_txid", header: "Txid", render: (r: any) => <span className="font-mono text-xs">{r.release_txid ? shortId(r.release_txid) : r.refund_txid ? shortId(r.refund_txid) : "—"}</span> },
        ]}
        rows={data?.ledger ?? []}
        rowKey={(r: any) => r.id}
        loading={loading}
        onRowClick={(r: any) => ctx.openOrder(r.id)}
        emptyTitle="No settled orders yet"
      />
      <Pagination page={page} perPage={25} count={data?.count ?? 0} onPage={setPage} />
    </div>
  );
}

export function PaymentsScreen({ ctx }: { ctx: ScreenCtx }) {
  const settled = useAsync(() => backendApi.admin.listPayments(ctx.token), []);
  const incomplete = useAsync(() => backendApi.payments.listIncomplete(ctx.token), []);
  const escrow = useAsync(() => backendApi.admin.listEscrow({ page: 1, perPage: 1 }, ctx.token), []);
  const [busy, setBusy] = useState<string | null>(null);

  const recover = async (paymentId: string) => {
    setBusy(paymentId);
    try {
      const res = await backendApi.payments.recover(paymentId, ctx.token);
      ctx.notify(`Recovery status: ${res.status}`, "success");
      incomplete.reload();
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : "Recovery failed", "danger");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">Payments</h1>
          <p className="text-xs text-muted-foreground">Settled transfers and Pi-side exceptions</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => downloadAdminExport("ledger", ctx.token).catch((e) => ctx.notify(e.message, "danger"))}>
          Export ledger
        </Button>
      </div>

      <Card className="p-4">
        <SectionHeading>Exceptions ({incomplete.data?.incomplete?.length ?? 0})</SectionHeading>
        {incomplete.loading ? (
          <div className="h-16 animate-pulse rounded bg-secondary/60" />
        ) : (incomplete.data?.incomplete?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No incomplete payments — Pi shows nothing stuck.</p>
        ) : (
          <div className="space-y-2">
            {incomplete.data!.incomplete.map((p: any) => (
              <div key={p.identifier} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 p-2">
                <div className="text-xs text-muted-foreground">
                  <span className="font-mono">{shortId(p.identifier)}</span> · {fmtPi(p.amount)} · {p.kind ?? "payment"}
                  {p.memo ? ` · ${p.memo}` : ""}
                </div>
                <Button size="sm" variant="outline" disabled={busy === p.identifier} onClick={() => recover(p.identifier)}>
                  {busy === p.identifier ? "Recovering…" : "Recover"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <SectionHeading>Wallet</SectionHeading>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Lease</p>
            <p className="text-foreground">{escrow.data?.wallet?.locked ? "held" : "free"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Owner</p>
            <p className="font-mono text-xs text-foreground">{escrow.data?.wallet?.owner ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Expires</p>
            <p className="text-foreground">{escrow.data?.wallet?.expiresAt ? fmtDateTime(escrow.data.wallet.expiresAt) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">In flight</p>
            <p className="text-foreground">{fmtPi(escrow.data?.inFlight?.total)}</p>
          </div>
        </div>
      </Card>

      <SectionHeading>Settled payments</SectionHeading>
      <DataTable
        columns={[
          { key: "type", header: "Type" },
          { key: "id", header: "Ref", render: (r: any) => <span className="font-mono text-xs">{shortId(r.id)}</span> },
          { key: "amount", header: "Amount", align: "right", render: (r: any) => (r.amount != null ? fmtPi(r.amount) : "—") },
          { key: "txid", header: "Txid", render: (r: any) => <span className="font-mono text-xs">{r.txid ? shortId(r.txid) : "—"}</span> },
          { key: "date", header: "Date", render: (r: any) => fmtDateTime(r.date) },
        ]}
        rows={settled.data?.payments ?? []}
        rowKey={(r: any) => `${r.type}:${r.id}`}
        loading={settled.loading}
        onRowClick={(r: any) => r.type === "hire_request" && ctx.openOrder(r.id)}
        emptyTitle="No settled payments"
      />
    </div>
  );
}

export function OffersScreen({ ctx }: { ctx: ScreenCtx }) {
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const { data, loading, error } = useAsync(() => backendApi.admin.listOffers({ status, page, perPage: 25 }, ctx.token), [status, page]);

  const counts = data?.statusCounts ?? {};
  const chips = [
    { id: "all", label: "All" },
    { id: "pending", label: "Pending", count: counts.pending },
    { id: "accepted", label: "Accepted", count: counts.accepted },
    { id: "declined", label: "Declined", count: counts.declined },
    { id: "withdrawn", label: "Withdrawn", count: counts.withdrawn },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">Offers &amp; Negotiations</h1>
          <p className="text-xs text-muted-foreground">Counter-offers on hire requests</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => downloadAdminExport("offers", ctx.token, { status }).catch((e) => ctx.notify(e.message, "danger"))}>
          Export CSV
        </Button>
      </div>
      <FilterChips options={chips} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}
      <DataTable
        columns={[
          { key: "service_title", header: "Listing" },
          { key: "proposer_name", header: "Proposer" },
          { key: "amount", header: "Offered", align: "right", render: (r: any) => fmtPi(r.amount) },
          { key: "request_amount", header: "Asking", align: "right", render: (r: any) => fmtPi(r.request_amount) },
          { key: "status", header: "Status", render: (r: any) => <StatusPill value={r.status} /> },
          { key: "created_at", header: "When", render: (r: any) => fmtRelative(r.created_at) },
        ]}
        rows={data?.offers ?? []}
        rowKey={(r: any) => r.id}
        loading={loading}
        onRowClick={(r: any) => ctx.openOrder(r.hire_request_id)}
        emptyTitle="No offers yet"
        emptyHint="Counter-offers appear here once a buyer or provider negotiates."
      />
      <Pagination page={page} perPage={25} count={data?.count ?? 0} onPage={setPage} />
    </div>
  );
}
