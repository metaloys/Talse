"use client";

// Editable revenue & cost model for the Revenue screen.
//
// Every number here is an assumption, so the whole panel is inputs plus a live
// projection. It starts from the platform's real fee / boost price / network
// fee and the stored Pi→USD assumption, but the planner can override any of
// them to test a scenario without changing platform config.

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card } from "../ui";
import { DataTable, Kpi, SectionHeading, fmtPi, fmtUsd, pct } from "./primitives";
import {
  SCENARIO_DEFAULTS,
  computeScenario,
  scenarioCsv,
  type ScenarioInputs,
} from "@/lib/revenue-model";

type Defaults = Partial<Pick<ScenarioInputs, "piUsdRate" | "feePercent" | "boostPricePi" | "networkFeePi">>;

/** Live Pi→USD quote shape returned by /api/admin/pi-price. */
export type LivePrice = {
  usd: number;
  source: string;
  sources: { name: string; usd: number }[];
  fetchedAt: string;
};

function positive(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function nonNegative(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function NumField({
  label,
  hint,
  value,
  onCommit,
  prefix,
  suffix,
  step = 1,
}: {
  label: string;
  hint?: string;
  value: number;
  onCommit: (value: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
}) {
  const [text, setText] = useState(String(value));
  const editing = useRef(false);

  // Keep the field in sync when the value changes elsewhere (reset, a new
  // platform default), but never fight the user mid-keystroke.
  useEffect(() => {
    if (!editing.current) setText(String(value));
  }, [value]);

  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      <span className="mt-1 flex items-center gap-1 rounded-xl border border-input bg-card px-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
        {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={text}
          onFocus={() => {
            editing.current = true;
          }}
          onBlur={() => {
            editing.current = false;
            setText(String(value));
          }}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            if (next.trim() === "") {
              onCommit(0);
              return;
            }
            const parsed = Number(next);
            if (Number.isFinite(parsed)) onCommit(parsed);
          }}
          step={step}
          className="w-full bg-transparent py-2 text-sm text-foreground outline-none ps-nums"
        />
        {suffix && <span className="shrink-0 text-xs text-muted-foreground">{suffix}</span>}
      </span>
      {hint && <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">{hint}</span>}
    </label>
  );
}

function SplitBar({ jobShare, boostShare }: { jobShare: number; boostShare: number }) {
  const jobPct = Math.max(0, Math.min(100, jobShare * 100));
  const boostPct = Math.max(0, Math.min(100, boostShare * 100));
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-primary" style={{ width: `${jobPct}%` }} />
        <div className="h-full bg-accent" style={{ width: `${boostPct}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" /> Job fees {pct(jobShare, 0)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent" /> Boosts {pct(boostShare, 0)}
        </span>
      </div>
    </div>
  );
}

export function ScenarioPlanner({ defaults, livePrice }: { defaults?: Defaults; livePrice?: LivePrice | null }) {
  const [overrides, setOverrides] = useState<Partial<ScenarioInputs>>({});

  const settingsDefaults = useMemo<Partial<ScenarioInputs>>(
    () => ({
      // The live market price is the default; the stored value is only a
      // fallback for when no market can be reached.
      piUsdRate: livePrice?.usd ?? positive(defaults?.piUsdRate, SCENARIO_DEFAULTS.piUsdRate),
      feePercent: positive(defaults?.feePercent, SCENARIO_DEFAULTS.feePercent),
      boostPricePi: positive(defaults?.boostPricePi, SCENARIO_DEFAULTS.boostPricePi),
      networkFeePi: nonNegative(defaults?.networkFeePi, SCENARIO_DEFAULTS.networkFeePi),
    }),
    [livePrice?.usd, defaults?.piUsdRate, defaults?.feePercent, defaults?.boostPricePi, defaults?.networkFeePi],
  );

  const inputs = useMemo<ScenarioInputs>(
    () => ({ ...SCENARIO_DEFAULTS, ...settingsDefaults, ...overrides }),
    [settingsDefaults, overrides],
  );
  const result = useMemo(() => computeScenario(inputs), [inputs]);

  const set = <K extends keyof ScenarioInputs>(key: K, value: ScenarioInputs[K]) =>
    setOverrides((prev) => ({ ...prev, [key]: value }));

  const reset = () => setOverrides({});

  const piPriceOverridden = overrides.piUsdRate !== undefined;
  const clearPiPriceOverride = () =>
    setOverrides((prev) => {
      const next = { ...prev };
      delete next.piUsdRate;
      return next;
    });
  const liveTime = livePrice
    ? new Date(livePrice.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const exportCsv = () => {
    const blob = new Blob([scenarioCsv(result)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "talse-scenario.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const breakEven =
    result.breakEvenJobsPerMonth === null
      ? "—"
      : result.breakEvenJobsPerMonth === 0
        ? "Covered by boosts"
        : `${Math.ceil(result.breakEvenJobsPerMonth)} jobs/mo`;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <SectionHeading>Scenario planner</SectionHeading>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Every field is an assumption you can change. USD uses the live market Pi price, which you can override below.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={reset}>
            Reset
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            Export CSV
          </Button>
        </div>
      </div>

      {/* Revenue result, split by source. */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label={`Job fees · ${inputs.months} mo`}
          value={fmtPi(result.totals.jobFeePi)}
          hint={`≈ ${fmtUsd(result.totals.jobFeeUsd)}`}
        />
        <Kpi
          label={`Boosts · ${inputs.months} mo`}
          value={fmtPi(result.totals.boostPi)}
          hint={`≈ ${fmtUsd(result.totals.boostUsd)}`}
        />
        <Kpi
          label="Combined revenue"
          value={fmtPi(result.totals.grossPi)}
          hint={`≈ ${fmtUsd(result.totals.grossUsd)}`}
        />
        <Kpi
          label="Net after network"
          value={fmtPi(result.totals.netPi)}
          hint={`≈ ${fmtUsd(result.totals.netUsd)} after infra`}
        />
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card p-3">
        <SplitBar jobShare={result.jobFeeShare} boostShare={result.boostShare} />
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            Break-even: <span className="font-semibold text-foreground">{breakEven}</span>
          </span>
          <span>
            Payback:{" "}
            <span className="font-semibold text-foreground">
              {result.paybackMonth ? `month ${result.paybackMonth}` : "beyond horizon"}
            </span>
          </span>
          <span>
            Network absorbed: <span className="font-semibold text-foreground">{fmtPi(result.totals.networkPi)}</span>
          </span>
          <span>
            Infra: <span className="font-semibold text-foreground">{fmtUsd(result.totals.infraUsd)}</span>
          </span>
        </div>
      </div>

      {/* Assumptions. */}
      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-foreground">Assumptions</p>
          <div className="inline-flex overflow-hidden rounded-lg border border-border">
            {[0.05, 0.1].map((rate) => {
              const active = Math.abs(inputs.feePercent - rate) < 1e-9;
              return (
                <button
                  key={rate}
                  type="button"
                  onClick={() => set("feePercent", rate)}
                  aria-pressed={active}
                  className={
                    active
                      ? "bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                      : "bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
                  }
                >
                  {rate * 100}% job fee
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          {livePrice ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 font-semibold text-success-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Live market · ${livePrice.usd.toFixed(4)}/π · {livePrice.source} · {liveTime}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 font-semibold text-warning-foreground">
              Live price unavailable — using the stored assumption
            </span>
          )}
          {piPriceOverridden && (
            <button
              type="button"
              onClick={clearPiPriceOverride}
              className="rounded-full border border-border px-2.5 py-1 font-semibold text-foreground hover:bg-secondary"
            >
              Manual override in use — reset to live
            </button>
          )}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <NumField
            label="Pi price"
            hint={livePrice && !piPriceOverridden ? "USD per 1 π · live market" : "USD per 1 π · manual"}
            value={inputs.piUsdRate}
            onCommit={(v) => set("piUsdRate", v)}
            prefix="$"
            suffix="/π"
            step={0.01}
          />
          <NumField
            label="Jobs per month"
            hint="New released jobs"
            value={inputs.jobsPerMonth}
            onCommit={(v) => set("jobsPerMonth", v)}
          />
          <NumField
            label="Avg job value"
            hint="Per completed job"
            value={inputs.avgJobValuePi}
            onCommit={(v) => set("avgJobValuePi", v)}
            suffix="π"
          />
          <NumField
            label="Boosts per month"
            hint="Paid listing promotions"
            value={inputs.boostsPerMonth}
            onCommit={(v) => set("boostsPerMonth", v)}
          />
          <NumField
            label="Boost price"
            hint="Per promotion"
            value={inputs.boostPricePi}
            onCommit={(v) => set("boostPricePi", v)}
            suffix="π"
          />
          <NumField
            label="Network fee"
            hint="Pi absorbed per payout"
            value={inputs.networkFeePi}
            onCommit={(v) => set("networkFeePi", v)}
            suffix="π"
            step={0.01}
          />
          <NumField
            label="Refund rate"
            hint="Share of jobs refunded"
            value={inputs.refundRatePct}
            onCommit={(v) => set("refundRatePct", v)}
            suffix="%"
          />
          <NumField
            label="Monthly growth"
            hint="Volume growth per month"
            value={inputs.growthPctPerMonth}
            onCommit={(v) => set("growthPctPerMonth", v)}
            suffix="%"
          />
          <NumField
            label="Infra cost"
            hint="Hosting, DB and tools"
            value={inputs.infraMonthlyUsd}
            onCommit={(v) => set("infraMonthlyUsd", v)}
            prefix="$"
            suffix="/mo"
          />
          <NumField
            label="Horizon"
            hint="Months to project"
            value={inputs.months}
            onCommit={(v) => set("months", Math.max(1, Math.min(36, Math.round(v))))}
            suffix="mo"
          />
        </div>
      </div>

      <div className="mt-4">
        <DataTable
          columns={[
            { key: "month", header: "Month", render: (r: any) => `M${r.month}` },
            { key: "releasedJobs", header: "Jobs", align: "right", render: (r: any) => r.releasedJobs.toFixed(1) },
            { key: "jobFeePi", header: "Job fees", align: "right", render: (r: any) => fmtPi(r.jobFeePi) },
            { key: "boostPi", header: "Boosts", align: "right", render: (r: any) => fmtPi(r.boostPi) },
            { key: "grossPi", header: "Revenue", align: "right", render: (r: any) => <span className="font-semibold">{fmtPi(r.grossPi)}</span> },
            { key: "grossUsd", header: "Revenue (USD)", align: "right", render: (r: any) => fmtUsd(r.grossUsd) },
            { key: "netUsd", header: "Net (USD)", align: "right", render: (r: any) => fmtUsd(r.netUsd) },
            {
              key: "cumulativeNetUsd",
              header: "Cumulative",
              align: "right",
              render: (r: any) => (
                <span className={r.cumulativeNetUsd >= 0 ? "font-semibold text-success" : "text-destructive"}>
                  {fmtUsd(r.cumulativeNetUsd)}
                </span>
              ),
            },
          ]}
          rows={result.months}
          rowKey={(r: any) => String(r.month)}
        />
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        Model: job fees = released jobs × average value × fee%; boosts = boosts sold × boost price. Costs = network
        fee absorbed + infra. USD = π × the live market Pi price (or your override). Projections are not forecasts.
      </p>
    </Card>
  );
}
