"use client";

// Business group: Revenue & P&L, Fees & Take Rate, Analytics, Exports.

import { useState } from "react";
import { backendApi, downloadAdminExport } from "@/lib/backend-api";
import { Button, Card } from "../ui";
import {
  BarChart,
  DataTable,
  Kpi,
  RangeSwitch,
  SectionHeading,
  Sparkline,
  fmtNum,
  fmtPi,
  fmtRelative,
  pct,
  useAsync,
} from "./primitives";
import type { ScreenCtx } from "./types";
import { ScenarioPlanner } from "./scenario-planner";

async function downloadAccountingCsv(range: string, token: string) {
  const res = await fetch(`/api/admin/accounting?range=${range}&format=csv`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `talse-earnings-${range}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function RevenueScreen({ ctx }: { ctx: ScreenCtx }) {
  const [range, setRange] = useState("30");
  const { data, loading, error } = useAsync(() => backendApi.admin.accounting(range, ctx.token), [range]);
  const price = useAsync(() => backendApi.admin.piPrice(ctx.token), []);
  const l = data?.lifetime;
  const t = data?.rangeTotals;
  const series = data?.series ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">Revenue &amp; P&amp;L</h1>
          <p className="text-xs text-muted-foreground">Money in, money out, and the bottom line</p>
        </div>
        <div className="flex items-center gap-2">
          <RangeSwitch value={range} onChange={setRange} />
          <Button size="sm" variant="outline" onClick={() => downloadAccountingCsv(range, ctx.token).catch((e) => ctx.notify(e.message, "danger"))}>
            Export daily CSV
          </Button>
        </div>
      </div>

      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Net earnings (all time)" value={fmtPi(l?.netEarnings)} hint={`gross ${fmtPi(l?.grossEarnings)}`} />
        <Kpi label="Transaction fees" value={fmtPi(l?.transactionFees)} hint="10% of released jobs" />
        <Kpi label="Boost revenue" value={fmtPi(l?.boostRevenue)} hint={`${l?.boostsSold ?? 0} sold`} />
        <Kpi label="Network costs" value={fmtPi(l?.networkCosts)} hint="absorbed by platform" />
        <Kpi label="Gross volume" value={fmtPi(l?.grossVolume)} />
        <Kpi label="Provider payouts" value={fmtPi(l?.providerPayouts)} />
        <Kpi label="Take rate (all time)" value={pct(data?.takeRate ?? 0, 1)} />
        <Kpi label="Released / refunded" value={`${l?.releasedJobs ?? 0} / ${l?.refundedJobs ?? 0}`} />
      </div>

      <Card className="p-4">
        <SectionHeading>Net earnings — last {range === "all" ? "all time" : `${range} days`}</SectionHeading>
        <Sparkline values={series.length ? series.map((s: any) => Number(s.netEarnings) || 0) : [0]} height={64} tone="success" />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">In range: fees</p>
            <p className="text-lg font-semibold text-foreground">{fmtPi(t?.transactionFees)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">In range: boosts</p>
            <p className="text-lg font-semibold text-foreground">{fmtPi(t?.boostRevenue)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">In range: network</p>
            <p className="text-lg font-semibold text-foreground">{fmtPi(t?.networkCosts)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">In range: net</p>
            <p className="text-lg font-semibold text-success">{fmtPi(t?.netEarnings)}</p>
          </div>
        </div>
      </Card>

      <ScenarioPlanner defaults={data?.assumptions} livePrice={price.data?.quote ?? null} />

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
        loading={loading}
        emptyTitle="No settled activity in this range"
      />
    </div>
  );
}

export function FeesScreen({ ctx }: { ctx: ScreenCtx }) {
  const fees = useAsync(() => backendApi.admin.getFees(ctx.token), []);
  const accounting = useAsync(() => backendApi.admin.accounting("all", ctx.token), []);
  const history = useAsync(() => backendApi.admin.getConfig(ctx.token).catch(() => ({ history: [] as any[] })), []);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-bold text-foreground">Fees &amp; Take Rate</h1>
        <p className="text-xs text-muted-foreground">Platform policy and what it earns</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Platform fee" value={pct(fees.data?.fee ?? 0, 1)} hint="of each released job" />
        <Kpi label="Effective take rate" value={pct(accounting.data?.takeRate ?? 0, 1)} hint="fees / gross volume" />
        <Kpi label="Fee revenue (all time)" value={fmtPi(accounting.data?.lifetime?.transactionFees)} />
        <Kpi label="Network fee absorbed" value={fmtPi(accounting.data?.lifetime?.networkCosts)} hint="per outgoing payout" />
      </div>

      <Card className="p-4">
        <SectionHeading>Change the fee</SectionHeading>
        <p className="text-xs text-muted-foreground">
          The platform fee is edited in <button className="text-primary underline" onClick={() => ctx.go("configuration")}>Configuration</button>. Every change is versioned and written to the audit log, and takes effect on the next release.
        </p>
      </Card>

      <SectionHeading>Fee change history</SectionHeading>
      <DataTable
        columns={[
          { key: "changed_at", header: "When", render: (r: any) => fmtRelative(r.changed_at) },
          { key: "key", header: "Setting" },
          { key: "previous_value", header: "From", render: (r: any) => String(r.previous_value ?? "—") },
          { key: "new_value", header: "To", render: (r: any) => <span className="font-semibold">{String(r.new_value ?? "—")}</span> },
          { key: "changed_by", header: "By", render: (r: any) => <span className="font-mono text-xs">{String(r.changed_by ?? "").slice(0, 8)}</span> },
        ]}
        rows={(history.data?.history ?? []).filter((h: any) => String(h.key).includes("fee") || String(h.key).includes("platform"))}
        rowKey={(r: any) => String(r.id)}
        loading={history.loading}
        emptyTitle="No fee changes recorded"
      />
    </div>
  );
}

export function AnalyticsScreen({ ctx }: { ctx: ScreenCtx }) {
  const [range, setRange] = useState("30");
  const { data, loading, error } = useAsync(() => backendApi.admin.analytics(range, ctx.token), [range]);
  const totals = data?.totals;
  const byName = data?.byName ?? {};

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">Analytics</h1>
          <p className="text-xs text-muted-foreground">Product events the app has been collecting</p>
        </div>
        <div className="flex items-center gap-2">
          <RangeSwitch value={range} onChange={setRange} />
          <Button size="sm" variant="outline" onClick={() => downloadAdminExport("events", ctx.token, { range }).catch((e) => ctx.notify(e.message, "danger"))}>
            Export events
          </Button>
        </div>
      </div>

      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Events" value={fmtNum(totals?.events)} />
        <Kpi label="Unique users" value={fmtNum(totals?.users)} />
        <Kpi label="Sessions" value={fmtNum(totals?.sessions)} />
        <Kpi label="Events / day" value={fmtNum(totals?.dailyAverage)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <SectionHeading>Activity over time</SectionHeading>
          <Sparkline values={(data?.series ?? []).map((s: any) => Number(s.events) || 0)} height={72} />
        </Card>
        <Card className="p-4">
          <SectionHeading>By event</SectionHeading>
          <BarChart data={Object.entries(byName).map(([label, value]) => ({ label: label.replace(/_/g, " "), value: Number(value) }))} formatValue={(v) => fmtNum(v)} />
        </Card>
      </div>

      <Card className="p-4">
        <SectionHeading>Funnel</SectionHeading>
        <BarChart data={(data?.funnel ?? []).map((f: any) => ({ label: f.step, value: f.count }))} formatValue={(v) => fmtNum(v)} />
      </Card>

      <SectionHeading>Most-viewed listings</SectionHeading>
      <DataTable
        columns={[
          { key: "title", header: "Listing" },
          { key: "views", header: "Views", align: "right" },
        ]}
        rows={data?.topServices ?? []}
        rowKey={(r: any) => r.id}
        loading={loading}
        emptyTitle="No views recorded in this range"
      />
    </div>
  );
}

const EXPORTS: Array<{ dataset: string; label: string; hint: string }> = [
  { dataset: "orders", label: "Orders", hint: "Every hire request with its money breakdown" },
  { dataset: "ledger", label: "Accounting ledger", hint: "Settled orders, fees and payouts" },
  { dataset: "boosts", label: "Boosts", hint: "Featured-listing purchases" },
  { dataset: "offers", label: "Offers", hint: "Counter-offer negotiations" },
  { dataset: "users", label: "Users", hint: "Profiles with activity counts" },
  { dataset: "reports", label: "Reports", hint: "Moderation queue" },
  { dataset: "events", label: "Events", hint: "Raw product analytics" },
  { dataset: "audit", label: "Audit log", hint: "Every admin action" },
];

export function ExportsScreen({ ctx }: { ctx: ScreenCtx }) {
  const [range, setRange] = useState("all");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">Exports</h1>
          <p className="text-xs text-muted-foreground">CSV downloads for finance and moderation</p>
        </div>
        <RangeSwitch value={range} onChange={setRange} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {EXPORTS.map((e) => (
          <Card key={e.dataset} className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">{e.label}</p>
              <p className="text-xs text-muted-foreground">{e.hint}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => downloadAdminExport(e.dataset, ctx.token, { range }).catch((err) => ctx.notify(err.message, "danger"))}>
              Download
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
