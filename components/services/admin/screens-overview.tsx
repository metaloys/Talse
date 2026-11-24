"use client";

// Overview group: the Dashboard (command centre) and Live Operations.

import { backendApi } from "@/lib/backend-api";
import { Button, Card, Pill } from "../ui";
import {
  BarChart,
  DataTable,
  Kpi,
  SectionHeading,
  Sparkline,
  StatusPill,
  fmtNum,
  fmtPi,
  fmtRelative,
  pct,
  useAsync,
} from "./primitives";
import type { ScreenCtx } from "./types";

function delta(cur: number, prev: number): number | null {
  if (!prev) return cur ? 1 : null;
  return (cur - prev) / prev;
}

export function DashboardScreen({ ctx }: { ctx: ScreenCtx }) {
  const { data, loading, error, reload } = useAsync(() => backendApi.admin.dashboard(ctx.token), []);

  const e = data?.earnings;
  const counts = data?.counts;
  const attention = data?.needsAttention;
  const series: any[] = data?.series ?? [];
  const gmv = Number(e?.grossVolume) || 0;
  const takeRate = gmv ? (Number(e?.transactionFees) || 0) / gmv : 0;
  const netSeries = series.map((r) => Number(r.netEarnings) || 0);

  const attentionItems = [
    { label: "Open disputes", value: attention?.openDisputes ?? 0, section: "reports" as const, tone: "danger" as const },
    { label: "Open reports", value: attention?.openReports ?? 0, section: "reports" as const, tone: "warning" as const },
    { label: "Pending offers", value: attention?.pendingOffers ?? 0, section: "offers" as const, tone: "accent" as const },
    { label: "Stale payout locks", value: attention?.stalePayouts ?? 0, section: "escrow" as const, tone: "warning" as const },
    { label: "Suspended users", value: attention?.suspendedUsers ?? 0, section: "trust" as const, tone: "neutral" as const },
  ].filter((i) => i.value > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            Live platform data{data?.generatedAt ? ` · updated ${fmtRelative(data.generatedAt)}` : ""}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Gross volume (all time)" value={fmtPi(gmv)} hint={`${e?.releasedJobs ?? 0} released · ${e?.refundedJobs ?? 0} refunded`} onClick={() => ctx.go("orders")} />
        <Kpi
          label="Net revenue"
          value={fmtPi(e?.netEarnings)}
          delta={e ? delta(Number(e.last30?.netEarnings) || 0, Number(e.prev30?.netEarnings) || 0) : null}
          hint="last 30d vs prior"
          onClick={() => ctx.go("revenue")}
        />
        <Kpi label="Take rate" value={pct(takeRate, 1)} hint={`fees ${fmtPi(e?.transactionFees)}`} onClick={() => ctx.go("revenue")} />
        <Kpi label="Escrow in flight" value={fmtPi(data?.escrow?.inFlight)} hint={`${data?.escrow?.openJobs ?? 0} open jobs`} onClick={() => ctx.go("escrow")} />
        <Kpi label="Active listings" value={fmtNum(counts?.activeServices)} onClick={() => ctx.go("listings")} />
        <Kpi label="Open orders" value={fmtNum(counts?.openRequests)} onClick={() => ctx.go("orders")} />
        <Kpi label="Boosts sold" value={fmtNum(e?.boostsSold)} hint={fmtPi(e?.boostRevenue)} onClick={() => ctx.go("boosts")} />
        <Kpi label="Users" value={fmtNum(counts?.users)} onClick={() => ctx.go("users")} />
      </div>

      {attentionItems.length > 0 && (
        <Card className="p-4">
          <SectionHeading>Needs attention</SectionHeading>
          <div className="flex flex-wrap gap-2">
            {attentionItems.map((i) => (
              <button
                key={i.label}
                onClick={() => ctx.go(i.section)}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"
              >
                <Pill tone={i.tone}>{i.value}</Pill>
                <span className="text-foreground">{i.label}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-foreground">Net revenue</p>
            <p className="text-xs text-muted-foreground">Daily platform profit, last 30 days</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => ctx.go("revenue")}>
            Full P&amp;L →
          </Button>
        </div>
        <div className="mt-3">
          <Sparkline values={netSeries.length ? netSeries : [0]} height={64} tone="success" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Transaction fees (30d)</p>
            <p className="text-lg font-semibold text-foreground">{fmtPi(e?.last30?.transactionFees)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Boost revenue (30d)</p>
            <p className="text-lg font-semibold text-foreground">{fmtPi(e?.last30?.boostRevenue)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Network costs (30d)</p>
            <p className="text-lg font-semibold text-foreground">{fmtPi(e?.last30?.networkCosts)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Provider payouts (all time)</p>
            <p className="text-lg font-semibold text-foreground">{fmtPi(e?.providerPayouts)}</p>
          </div>
        </div>
        {series.length > 0 && (
          <div className="mt-4">
            <DataTable
              columns={[
                { key: "day", header: "Day" },
                { key: "transactionFees", header: "Job fees", align: "right", render: (r: any) => fmtPi(r.transactionFees) },
                { key: "boostRevenue", header: "Boosts", align: "right", render: (r: any) => fmtPi(r.boostRevenue) },
                { key: "networkCosts", header: "Network", align: "right", render: (r: any) => fmtPi(r.networkCosts) },
                { key: "netEarnings", header: "Net", align: "right", render: (r: any) => <span className="font-semibold">{fmtPi(r.netEarnings)}</span> },
              ]}
              rows={series.slice().reverse()}
              rowKey={(r: any) => String(r.day)}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

export function LiveScreen({ ctx }: { ctx: ScreenCtx }) {
  const { data, loading, error, reload } = useAsync(() => backendApi.admin.live(ctx.token), []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">Live Operations</h1>
          <p className="text-xs text-muted-foreground">Newest orders, reports and product events</p>
        </div>
        <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}
      <Card className="divide-y divide-border p-0">
        {(data?.items ?? []).map((item: any) => (
          <button
            key={item.id}
            onClick={() => {
              if (item.kind === "order") ctx.openOrder(item.link?.id);
              else if (item.link?.type === "user") ctx.openUser(item.link.id);
              else if (item.kind === "report") ctx.go("reports");
            }}
            className="flex w-full items-start gap-3 p-3 text-left hover:bg-secondary/50"
          >
            <StatusPill value={item.kind} label={item.kind} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              {item.detail && <p className="truncate text-xs text-muted-foreground">{item.detail}</p>}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{fmtRelative(item.at)}</span>
          </button>
        ))}
        {!loading && !(data?.items ?? []).length && <p className="p-6 text-center text-sm text-muted-foreground">No activity yet.</p>}
      </Card>
    </div>
  );
}

// Re-exported so the console can render a compact bar chart of event counts.
export function EventBreakdown({ counts }: { counts: Record<string, number> }) {
  const data = Object.entries(counts).map(([label, value]) => ({ label: label.replace(/_/g, " "), value }));
  return <BarChart data={data} formatValue={(v) => fmtNum(v)} />;
}
