// Revenue & cost scenario model.
//
// One pure function powers both the admin "Scenario planner" and the numbers in
// `submission/REVENUE-COSTS.md`. Keeping the maths here means a projection in
// the report can never drift from what the console shows.
//
// Two revenue sources, deliberately kept separate:
//   1. Job completion fees  = released jobs x average job value x fee %
//   2. Listing boost sales   = boosts sold x boost price
//
// Costs:
//   - network fee the platform absorbs per released payout (Pi)
//   - infrastructure (USD per month, entered by the planner)
//
// USD values are Pi x a rate. The console defaults that rate to the live market
// Pi price (lib/pi-price.ts) and lets the planner override it; the rate stays an
// explicit input here so this maths is pure and deterministic.

export type ScenarioInputs = {
  /** USD per 1 Pi. Defaults to the live market price; overridable in the planner. */
  piUsdRate: number;
  /** Job completion fee as a fraction, e.g. 0.05 or 0.10. */
  feePercent: number;
  jobsPerMonth: number;
  /** Average value of a released job, in Pi. */
  avgJobValuePi: number;
  boostsPerMonth: number;
  boostPricePi: number;
  /** Pi the platform absorbs per released payout. */
  networkFeePi: number;
  /** Share of jobs that end refunded (no fee earned), 0-100. */
  refundRatePct: number;
  /** Month-over-month growth in job and boost volume, in percent. */
  growthPctPerMonth: number;
  /** Hosting, database and other fixed costs, in USD per month. */
  infraMonthlyUsd: number;
  months: number;
};

export const SCENARIO_DEFAULTS: ScenarioInputs = {
  piUsdRate: 0.3,
  feePercent: 0.1,
  jobsPerMonth: 50,
  avgJobValuePi: 20,
  boostsPerMonth: 8,
  boostPricePi: 5,
  networkFeePi: 0.01,
  refundRatePct: 3,
  growthPctPerMonth: 10,
  infraMonthlyUsd: 50,
  months: 12,
};

export type ScenarioMonth = {
  month: number;
  jobs: number;
  releasedJobs: number;
  jobFeePi: number;
  jobFeeUsd: number;
  boostPi: number;
  boostUsd: number;
  grossPi: number;
  grossUsd: number;
  networkPi: number;
  networkUsd: number;
  infraUsd: number;
  netPi: number;
  netUsd: number;
  cumulativeNetUsd: number;
};

export type ScenarioResult = {
  months: ScenarioMonth[];
  first: ScenarioMonth;
  totals: {
    jobs: number;
    releasedJobs: number;
    jobFeePi: number;
    jobFeeUsd: number;
    boostPi: number;
    boostUsd: number;
    grossPi: number;
    grossUsd: number;
    networkPi: number;
    networkUsd: number;
    infraUsd: number;
    netPi: number;
    netUsd: number;
  };
  /** Job fee share of combined revenue over the projection, 0-1. */
  jobFeeShare: number;
  /** Boost share of combined revenue over the projection, 0-1. */
  boostShare: number;
  /**
   * Released jobs needed per month for revenue to cover fixed USD costs, at
   * month-one volume. Null when costs are already covered by boosts alone, or
   * when a job earns nothing after refunds and network fees.
   */
  breakEvenJobsPerMonth: number | null;
  /** First month whose cumulative net USD is >= 0, or null if none. */
  paybackMonth: number | null;
};

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function computeScenario(raw: ScenarioInputs): ScenarioResult {
  const piUsdRate = nonNegative(raw.piUsdRate);
  const feePercent = clamp(raw.feePercent, 0, 0.5);
  const jobsPerMonth = nonNegative(raw.jobsPerMonth);
  const avgJobValuePi = nonNegative(raw.avgJobValuePi);
  const boostsPerMonth = nonNegative(raw.boostsPerMonth);
  const boostPricePi = nonNegative(raw.boostPricePi);
  const networkFeePi = nonNegative(raw.networkFeePi);
  const refundShare = clamp(raw.refundRatePct / 100, 0, 0.9);
  const growth = clamp(raw.growthPctPerMonth / 100, -0.5, 1);
  const infraMonthlyUsd = nonNegative(raw.infraMonthlyUsd);
  const monthCount = Math.round(clamp(raw.months, 1, 36));

  const months: ScenarioMonth[] = [];
  let cumulativeNetUsd = 0;

  for (let index = 0; index < monthCount; index += 1) {
    const scale = Math.pow(1 + growth, index);
    const jobs = jobsPerMonth * scale;
    const releasedJobs = jobs * (1 - refundShare);

    const jobFeePi = releasedJobs * avgJobValuePi * feePercent;
    const boostPi = boostsPerMonth * scale * boostPricePi;
    const grossPi = jobFeePi + boostPi;
    const networkPi = releasedJobs * networkFeePi;
    const netPi = grossPi - networkPi;
    const netUsd = netPi * piUsdRate - infraMonthlyUsd;
    cumulativeNetUsd += netUsd;

    months.push({
      month: index + 1,
      jobs,
      releasedJobs,
      jobFeePi,
      jobFeeUsd: jobFeePi * piUsdRate,
      boostPi,
      boostUsd: boostPi * piUsdRate,
      grossPi,
      grossUsd: grossPi * piUsdRate,
      networkPi,
      networkUsd: networkPi * piUsdRate,
      infraUsd: infraMonthlyUsd,
      netPi,
      netUsd,
      cumulativeNetUsd,
    });
  }

  const totals = months.reduce(
    (acc, m) => ({
      jobs: acc.jobs + m.jobs,
      releasedJobs: acc.releasedJobs + m.releasedJobs,
      jobFeePi: acc.jobFeePi + m.jobFeePi,
      jobFeeUsd: acc.jobFeeUsd + m.jobFeeUsd,
      boostPi: acc.boostPi + m.boostPi,
      boostUsd: acc.boostUsd + m.boostUsd,
      grossPi: acc.grossPi + m.grossPi,
      grossUsd: acc.grossUsd + m.grossUsd,
      networkPi: acc.networkPi + m.networkPi,
      networkUsd: acc.networkUsd + m.networkUsd,
      infraUsd: acc.infraUsd + m.infraUsd,
      netPi: acc.netPi + m.netPi,
      netUsd: acc.netUsd + m.netUsd,
    }),
    {
      jobs: 0,
      releasedJobs: 0,
      jobFeePi: 0,
      jobFeeUsd: 0,
      boostPi: 0,
      boostUsd: 0,
      grossPi: 0,
      grossUsd: 0,
      networkPi: 0,
      networkUsd: 0,
      infraUsd: 0,
      netPi: 0,
      netUsd: 0,
    },
  );

  const jobFeeShare = totals.grossPi > 0 ? totals.jobFeePi / totals.grossPi : 0;
  const boostShare = totals.grossPi > 0 ? totals.boostPi / totals.grossPi : 0;

  // Break-even at month-one volume: how many released jobs does it take for
  // revenue to cover fixed USD costs once boosts are counted?
  const monthlyCostPi = piUsdRate > 0 ? infraMonthlyUsd / piUsdRate : 0;
  const boostContributionPi = boostsPerMonth * boostPricePi;
  const remainingCostPi = Math.max(0, monthlyCostPi - boostContributionPi);
  const netPerJobPi = (1 - refundShare) * (avgJobValuePi * feePercent - networkFeePi);
  const breakEvenJobsPerMonth =
    remainingCostPi === 0 ? 0 : netPerJobPi > 0 ? remainingCostPi / netPerJobPi : null;

  const payback = months.find((m) => m.cumulativeNetUsd >= 0);

  return {
    months,
    first: months[0],
    totals,
    jobFeeShare,
    boostShare,
    breakEvenJobsPerMonth,
    paybackMonth: payback ? payback.month : null,
  };
}

/** CSV of the monthly projection, for a spreadsheet. */
export function scenarioCsv(result: ScenarioResult): string {
  const columns = [
    "month",
    "jobs",
    "released_jobs",
    "job_fee_pi",
    "job_fee_usd",
    "boost_pi",
    "boost_usd",
    "gross_pi",
    "gross_usd",
    "network_pi",
    "network_usd",
    "infra_usd",
    "net_pi",
    "net_usd",
    "cumulative_net_usd",
  ];
  const cell = (value: unknown) => {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = result.months.map((m) =>
    [
      m.month,
      m.jobs.toFixed(2),
      m.releasedJobs.toFixed(2),
      m.jobFeePi.toFixed(2),
      m.jobFeeUsd.toFixed(2),
      m.boostPi.toFixed(2),
      m.boostUsd.toFixed(2),
      m.grossPi.toFixed(2),
      m.grossUsd.toFixed(2),
      m.networkPi.toFixed(2),
      m.networkUsd.toFixed(2),
      m.infraUsd.toFixed(2),
      m.netPi.toFixed(2),
      m.netUsd.toFixed(2),
      m.cumulativeNetUsd.toFixed(2),
    ]
      .map(cell)
      .join(","),
  );
  return `${columns.join(",")}\n${body.join("\n")}\n`;
}
