import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError } from "@/lib/admin-route";

// GET /api/admin/accounting?range=7|30|90|all[&format=csv]
//
// The platform's books: lifetime totals from v_platform_earnings and the daily
// series from v_platform_earnings_daily. Previously the dashboard flattened the
// 30-day series into a single number and threw the per-day detail away.
//
//   money in   transaction_fees (10% of released jobs) + boost_revenue
//   money out  network_costs (Pi the platform absorbed on payouts)
//   bottom     net_earnings
//
// `format=csv` streams the daily series as a spreadsheet for finance.

function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const header = columns.join(",");
  const body = rows
    .map((r) =>
      columns
        .map((c) => {
          const v = r[c];
          const s = v === null || v === undefined ? "" : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
  return `${header}\n${body}\n`;
}

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "revenue");

    const url = new URL(req.url);
    const range = url.searchParams.get("range") ?? "30";
    const format = url.searchParams.get("format");
    const since = range === "all" ? null : new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    let seriesQuery = supabaseAdmin
      .from("v_platform_earnings_daily")
      .select("day, transaction_fees, boost_revenue, network_costs, net_earnings")
      .order("day", { ascending: true });
    if (since) seriesQuery = seriesQuery.gte("day", since);

    const [lifetimeRes, seriesRes] = await Promise.all([
      supabaseAdmin.from("v_platform_earnings").select("*").single(),
      seriesQuery,
    ]);

    if (lifetimeRes.error || seriesRes.error) {
      console.error("[admin:accounting] views failed:", lifetimeRes.error?.message, seriesRes.error?.message);
      return NextResponse.json({ error: "Accounting views unavailable. Run migration 009." }, { status: 500 });
    }

    const num = (v: unknown) => Number(v) || 0;
    const series = (seriesRes.data ?? []).map((r: Record<string, unknown>) => ({
      day: r.day,
      transactionFees: num(r.transaction_fees),
      boostRevenue: num(r.boost_revenue),
      networkCosts: num(r.network_costs),
      netEarnings: num(r.net_earnings),
    }));

    if (format === "csv") {
      const csv = toCsv(
        series as unknown as Array<Record<string, unknown>>,
        ["day", "transactionFees", "boostRevenue", "networkCosts", "netEarnings"],
      );
      return new NextResponse(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="talse-earnings-${range}.csv"`,
        },
      });
    }

    const totals = series.reduce(
      (acc, r) => ({
        transactionFees: acc.transactionFees + r.transactionFees,
        boostRevenue: acc.boostRevenue + r.boostRevenue,
        networkCosts: acc.networkCosts + r.networkCosts,
        netEarnings: acc.netEarnings + r.netEarnings,
      }),
      { transactionFees: 0, boostRevenue: 0, networkCosts: 0, netEarnings: 0 },
    );

    const e = lifetimeRes.data ?? {};
    const lifetime = {
      transactionFees: num(e.transaction_fees),
      boostRevenue: num(e.boost_revenue),
      networkCosts: num(e.network_costs),
      netEarnings: num(e.net_earnings),
      grossEarnings: num(e.gross_earnings),
      grossVolume: num(e.gross_volume),
      providerPayouts: num(e.provider_payouts),
      releasedJobs: num(e.released_jobs),
      refundedJobs: num(e.refunded_jobs),
      boostsSold: num(e.boosts_sold),
    };

    const takeRate = lifetime.grossVolume > 0 ? lifetime.transactionFees / lifetime.grossVolume : 0;

    return NextResponse.json({ range, lifetime, rangeTotals: totals, series, takeRate });
  } catch (err) {
    return adminError(err, "accounting");
  }
}
