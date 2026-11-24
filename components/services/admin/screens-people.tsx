"use client";

// People & moderation group: Users, Providers, Reviews, Reports, Disputes,
// Conversations, Trust & Safety.

import { useState } from "react";
import { backendApi, downloadAdminExport } from "@/lib/backend-api";
import { Button, Card } from "../ui";
import {
  ConfirmModal,
  DataTable,
  FilterChips,
  Kpi,
  Pagination,
  SearchInput,
  SectionHeading,
  StatusPill,
  fmtDate,
  fmtPi,
  fmtRelative,
  shortId,
  useAsync,
} from "./primitives";
import type { ScreenCtx } from "./types";

export function UsersScreen({ ctx }: { ctx: ScreenCtx }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { data, loading, error } = useAsync(
    () => backendApi.admin.listUsers({ search, page, perPage: 25, filter: filter === "all" ? undefined : filter } as any, ctx.token),
    [search, page, filter],
  );

  const chips = [
    { id: "all", label: "All" },
    { id: "providers", label: "Providers" },
    { id: "suspended", label: "Suspended" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">Users</h1>
          <p className="text-xs text-muted-foreground">Accounts, activity and trust signals</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => downloadAdminExport("users", ctx.token, { range: "all" }).catch((e) => ctx.notify(e.message, "danger"))}>
          Export CSV
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search username, display name, uid…" />
        <FilterChips options={chips} value={filter} onChange={(v) => { setFilter(v); setPage(1); }} />
      </div>
      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}
      <DataTable
        columns={[
          { key: "username", header: "Pioneer", render: (r: any) => <span className="font-medium">{r.display_name || r.username || shortId(r.pi_uid)}</span> },
          { key: "rating_avg", header: "Rating", align: "right", render: (r: any) => `${(Number(r.rating_avg) || 0).toFixed(1)} (${r.rating_count ?? 0})` },
          { key: "jobs_completed", header: "Jobs", align: "right", render: (r: any) => r.jobs_completed ?? 0 },
          { key: "total_earned", header: "Earned", align: "right", render: (r: any) => fmtPi(r.total_earned) },
          { key: "active_listings", header: "Listings", align: "right", render: (r: any) => r.active_listings ?? 0 },
          { key: "reports_against", header: "Reports", align: "right", render: (r: any) => r.reports_against ?? 0 },
          { key: "state", header: "State", render: (r: any) => (r.suspended_at ? <StatusPill value="suspended" label="suspended" /> : <StatusPill value="active" />) },
          { key: "created_at", header: "Joined", render: (r: any) => fmtDate(r.created_at) },
        ]}
        rows={data?.users ?? []}
        rowKey={(r: any) => r.pi_uid}
        loading={loading}
        onRowClick={(r: any) => ctx.openUser(r.pi_uid)}
        emptyTitle="No users"
      />
      <Pagination page={page} perPage={25} count={(data?.users?.length ?? 0) >= 25 ? page * 25 + 1 : (page - 1) * 25 + (data?.users?.length ?? 0)} onPage={setPage} />
    </div>
  );
}

export function ProvidersScreen({ ctx }: { ctx: ScreenCtx }) {
  const { data, loading, error } = useAsync(() => backendApi.admin.listUsers({ filter: "providers", perPage: 100 } as any, ctx.token), []);
  const providers = (data?.users ?? [])
    .slice()
    .sort((a: any, b: any) => (Number(b.total_earned) || 0) - (Number(a.total_earned) || 0));

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-bold text-foreground">Providers</h1>
        <p className="text-xs text-muted-foreground">Ranked by earnings, with completion and refund signals</p>
      </div>
      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}
      <DataTable
        columns={[
          { key: "username", header: "Provider", render: (r: any) => <span className="font-medium">{r.display_name || r.username}</span> },
          { key: "total_earned", header: "Earned", align: "right", render: (r: any) => fmtPi(r.total_earned) },
          { key: "completed_jobs", header: "Completed", align: "right", render: (r: any) => r.completed_jobs ?? 0 },
          { key: "rating_avg", header: "Rating", align: "right", render: (r: any) => (Number(r.rating_avg) || 0).toFixed(1) },
          { key: "refunds_against_provider", header: "Refunds", align: "right", render: (r: any) => r.refunds_against_provider ?? 0 },
          { key: "boost_spend", header: "Boost spend", align: "right", render: (r: any) => fmtPi(r.boost_spend) },
          { key: "active_listings", header: "Listings", align: "right", render: (r: any) => r.active_listings ?? 0 },
        ]}
        rows={providers}
        rowKey={(r: any) => r.pi_uid}
        loading={loading}
        onRowClick={(r: any) => ctx.openUser(r.pi_uid)}
        emptyTitle="No providers yet"
      />
    </div>
  );
}

export function ReviewsScreen({ ctx }: { ctx: ScreenCtx }) {
  const { data, loading, error, reload } = useAsync(() => backendApi.admin.listReviews(ctx.token), []);
  const [pending, setPending] = useState<null | { row: any }>(null);
  const [busy, setBusy] = useState(false);
  const [ratingFilter, setRatingFilter] = useState("all");

  const rows = (data?.reviews ?? []).filter((r: any) => ratingFilter === "all" || String(r.rating) === ratingFilter);

  const toggle = async (reason: string) => {
    if (!pending) return;
    setBusy(true);
    try {
      const hide = !pending.row.hidden_at;
      await backendApi.admin.setReviewHidden(pending.row.id, hide, reason, ctx.token);
      ctx.notify(hide ? "Review hidden." : "Review restored.", "success");
      setPending(null);
      reload();
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : "Action failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-bold text-foreground">Reviews</h1>
        <p className="text-xs text-muted-foreground">Feedback moderation</p>
      </div>
      <FilterChips
        options={[{ id: "all", label: "All" }, ...[5, 4, 3, 2, 1].map((n) => ({ id: String(n), label: `${n}★` }))]}
        value={ratingFilter}
        onChange={setRatingFilter}
      />
      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}
      <DataTable
        columns={[
          { key: "rating", header: "Rating", render: (r: any) => <span className="font-semibold">{r.rating}★</span> },
          { key: "text", header: "Review", render: (r: any) => <span className="line-clamp-2 max-w-md text-muted-foreground">{r.text || "—"}</span> },
          { key: "created_at", header: "When", render: (r: any) => fmtRelative(r.created_at) },
          { key: "state", header: "State", render: (r: any) => <StatusPill value={r.hidden_at ? "hidden" : "visible"} /> },
          {
            key: "actions",
            header: "",
            align: "right",
            render: (r: any) => (
              <Button size="sm" variant="ghost" onClick={() => setPending({ row: r })}>
                {r.hidden_at ? "Restore" : "Hide"}
              </Button>
            ),
          },
        ]}
        rows={rows}
        rowKey={(r: any) => r.id}
        loading={loading}
        emptyTitle="No reviews"
      />
      <ConfirmModal
        open={Boolean(pending)}
        busy={busy}
        tone={pending?.row?.hidden_at ? "success" : "danger"}
        title={pending?.row?.hidden_at ? "Restore this review?" : "Hide this review?"}
        requireReason={!pending?.row?.hidden_at}
        reasonLabel="Reason (recorded in the audit log)"
        confirmLabel={pending?.row?.hidden_at ? "Restore" : "Hide"}
        onConfirm={toggle}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

export function ReportsScreen({ ctx }: { ctx: ScreenCtx }) {
  const [status, setStatus] = useState("open");
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsync(() => backendApi.admin.listReports({ status: status === "all" ? undefined : status, page, perPage: 25 }, ctx.token), [status, page]);
  const [pending, setPending] = useState<null | { row: any; next: string }>(null);
  const [busy, setBusy] = useState(false);

  const resolve = async (note: string) => {
    if (!pending) return;
    setBusy(true);
    try {
      await backendApi.admin.updateReport(pending.row.id, { status: pending.next, admin_note: note }, ctx.token);
      ctx.notify(`Report ${pending.next}.`, "success");
      setPending(null);
      reload();
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : "Action failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">Reports</h1>
          <p className="text-xs text-muted-foreground">Moderation queue</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => downloadAdminExport("reports", ctx.token, { status }).catch((e) => ctx.notify(e.message, "danger"))}>
          Export CSV
        </Button>
      </div>
      <FilterChips
        options={[{ id: "open", label: "Open" }, { id: "resolved", label: "Resolved" }, { id: "dismissed", label: "Dismissed" }, { id: "all", label: "All" }]}
        value={status}
        onChange={(v) => { setStatus(v); setPage(1); }}
      />
      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}
      <DataTable
        columns={[
          { key: "target_type", header: "Target", render: (r: any) => <span className="text-xs">{r.target_type}</span> },
          { key: "reason", header: "Reason", render: (r: any) => r.reason ?? "—" },
          { key: "reporter", header: "Reporter", render: (r: any) => r.reporter?.display_name ?? r.reporter?.username ?? shortId(r.reporter_uid) },
          { key: "created_at", header: "When", render: (r: any) => fmtRelative(r.created_at) },
          { key: "status", header: "Status", render: (r: any) => <StatusPill value={r.status} /> },
          {
            key: "actions",
            header: "",
            align: "right",
            render: (r: any) =>
              r.status === "open" ? (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={(e: any) => { e.stopPropagation(); setPending({ row: r, next: "resolved" }); }}>
                    Resolve
                  </Button>
                  <Button size="sm" variant="ghost" onClick={(e: any) => { e.stopPropagation(); setPending({ row: r, next: "dismissed" }); }}>
                    Dismiss
                  </Button>
                </div>
              ) : null,
          },
        ]}
        rows={data?.reports ?? []}
        rowKey={(r: any) => r.id}
        loading={loading}
        onRowClick={(r: any) => { if (r.target_type === "user") ctx.openUser(r.target_id); }}
        emptyTitle="No reports"
        emptyHint="Open reports appear here for triage."
      />
      <Pagination page={page} perPage={25} count={data?.count ?? (data?.reports?.length ?? 0)} onPage={setPage} />
      <ConfirmModal
        open={Boolean(pending)}
        busy={busy}
        tone={pending?.next === "resolved" ? "success" : "primary"}
        title={pending?.next === "resolved" ? "Resolve this report?" : "Dismiss this report?"}
        message={pending?.row?.reason ? `Reason: ${pending.row.reason}` : undefined}
        requireReason={pending?.next === "dismissed"}
        reasonLabel="Admin note"
        confirmLabel={pending?.next === "resolved" ? "Resolve" : "Dismiss"}
        onConfirm={resolve}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

export function DisputesScreen({ ctx }: { ctx: ScreenCtx }) {
  const { data, loading, error, reload } = useAsync(() => backendApi.admin.listDisputes(ctx.token), []);
  const [busy, setBusy] = useState<string | null>(null);

  const setStage = async (row: any, stage: "investigating" | "escalated") => {
    setBusy(row.id + stage);
    try {
      await backendApi.admin.updateDispute(row.id, { stage }, ctx.token);
      ctx.notify("Dispute updated.", "success");
      reload();
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : "Action failed", "danger");
    } finally {
      setBusy(null);
    }
  };

  const disputes = data?.disputes ?? [];

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-bold text-foreground">Disputes</h1>
        <p className="text-xs text-muted-foreground">Escrow disputes awaiting a decision — open one to release or refund</p>
      </div>
      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}
      <DataTable
        columns={[
          { key: "id", header: "Order", render: (r: any) => <span className="font-mono text-xs">{shortId(r.id)}</span> },
          { key: "service_title", header: "Listing" },
          { key: "amount", header: "Amount", align: "right", render: (r: any) => fmtPi(r.amount) },
          { key: "dispute_reason", header: "Reason", render: (r: any) => <span className="line-clamp-1 max-w-xs">{r.dispute_reason ?? "—"}</span> },
          { key: "dispute_stage", header: "Stage", render: (r: any) => <StatusPill value={r.dispute_stage ?? "open"} label={r.dispute_stage ?? "open"} /> },
          { key: "created_at", header: "Filed", render: (r: any) => fmtRelative(r.created_at) },
          {
            key: "actions",
            header: "",
            align: "right",
            render: (r: any) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" disabled={busy === r.id + "investigating"} onClick={(e: any) => { e.stopPropagation(); setStage(r, "investigating"); }}>
                  Investigate
                </Button>
                <Button size="sm" variant="ghost" disabled={busy === r.id + "escalated"} onClick={(e: any) => { e.stopPropagation(); setStage(r, "escalated"); }}>
                  Escalate
                </Button>
              </div>
            ),
          },
        ]}
        rows={disputes}
        rowKey={(r: any) => r.id}
        loading={loading}
        onRowClick={(r: any) => ctx.openOrder(r.id)}
        emptyTitle="No disputes"
        emptyHint="Enjoy the quiet — disputes land here the moment one is filed."
      />
      <SectionHeading>Money decisions</SectionHeading>
      <p className="text-xs text-muted-foreground">Open a dispute to release the escrow to the provider or refund the buyer. Both actions require a reason and are written to the audit log.</p>
    </div>
  );
}

export function ConversationsScreen({ ctx }: { ctx: ScreenCtx }) {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useAsync(() => backendApi.admin.listConversations({ page, perPage: 25 }, ctx.token), [page]);
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-bold text-foreground">Conversations</h1>
        <p className="text-xs text-muted-foreground">Order threads — read-only, for investigation</p>
      </div>
      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}
      <DataTable
        columns={[
          { key: "service_title", header: "Listing" },
          { key: "parties", header: "Parties", render: (r: any) => `${r.buyer_name ?? "?"} → ${r.provider_name ?? "?"}` },
          { key: "message_count", header: "Messages", align: "right" },
          { key: "status", header: "Order", render: (r: any) => <StatusPill value={r.status} /> },
          { key: "last_message_at", header: "Last message", render: (r: any) => fmtRelative(r.last_message_at) },
        ]}
        rows={data?.conversations ?? []}
        rowKey={(r: any) => r.id}
        loading={loading}
        onRowClick={(r: any) => ctx.openOrder(r.id)}
        emptyTitle="No conversations"
      />
      <Pagination page={page} perPage={25} count={data?.count ?? 0} onPage={setPage} />
    </div>
  );
}

export function TrustScreen({ ctx }: { ctx: ScreenCtx }) {
  const suspended = useAsync(() => backendApi.admin.listUsers({ filter: "suspended", perPage: 50 } as any, ctx.token), []);
  const inactive = useAsync(() => backendApi.admin.listListings({ active: "false", perPage: 25 }, ctx.token), []);
  const reports = useAsync(() => backendApi.admin.listReports({ status: "open", perPage: 10 }, ctx.token), []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-foreground">Trust &amp; Safety</h1>
        <p className="text-xs text-muted-foreground">Suspended accounts, deactivated listings and the open report queue</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Suspended accounts" value={suspended.data?.users?.length ?? 0} />
        <Kpi label="Deactivated listings" value={inactive.data?.listings?.length ?? 0} />
        <Kpi label="Open reports" value={reports.data?.reports?.length ?? 0} />
      </div>

      <SectionHeading>Suspended accounts</SectionHeading>
      <DataTable
        columns={[
          { key: "username", header: "User", render: (r: any) => r.display_name || r.username },
          { key: "suspension_reason", header: "Reason" },
          { key: "suspended_at", header: "Since", render: (r: any) => fmtRelative(r.suspended_at) },
        ]}
        rows={suspended.data?.users ?? []}
        rowKey={(r: any) => r.pi_uid}
        loading={suspended.loading}
        onRowClick={(r: any) => ctx.openUser(r.pi_uid)}
        emptyTitle="No suspended accounts"
      />

      <SectionHeading>Deactivated listings</SectionHeading>
      <DataTable
        columns={[
          { key: "title", header: "Listing" },
          { key: "provider_name", header: "Provider" },
          { key: "updated_at", header: "Updated", render: (r: any) => fmtRelative(r.updated_at) },
        ]}
        rows={inactive.data?.listings ?? []}
        rowKey={(r: any) => r.id}
        loading={inactive.loading}
        emptyTitle="No deactivated listings"
      />

      <SectionHeading>Open reports</SectionHeading>
      <DataTable
        columns={[
          { key: "target_type", header: "Target" },
          { key: "reason", header: "Reason" },
          { key: "created_at", header: "When", render: (r: any) => fmtRelative(r.created_at) },
        ]}
        rows={reports.data?.reports ?? []}
        rowKey={(r: any) => r.id}
        loading={reports.loading}
        onRowClick={() => ctx.go("reports")}
        emptyTitle="No open reports"
      />
    </div>
  );
}
