import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError } from "@/lib/admin-route";

// GET /api/admin/dashboard
//
// Command-centre data:
//   counts        operational totals
//   earnings      lifetime P&L per source, plus the last 30 days and the 30
//                 days before that so the KPI row can show a delta
//   series        daily P&L for the chart (previously computed and discarded)
//   escrow        Pi held for jobs in progress (a liability, never revenue)
//   needsAttention  short work queue: disputes, open reports, pending offers,
//                 suspended-but-listed providers, stale payout locks
export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "overview");

    const now = Date.now();
    const day30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const day60 = new Date(now - 60 * 24 * 60 * 60 * 1000);
    const since30 = day30.toISOString().slice(0, 10);
    const since60 = day60.toISOString().slice(0, 10);

    const [
      { count: usersCount },
      { count: activeServicesCount },
      { count: openRequestsCount },
      { count: completedJobsCount },
      { count: openReportsCount },
      { count: openDisputesCount },
      { count: pendingOffersCount },
      { count: suspendedCount },
      earningsRes,
      dailyRes,
      escrowRes,
      statusesRes,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("pi_uid", { head: true, count: "exact" }),
      supabaseAdmin.from("services").select("id", { head: true, count: "exact" }).eq("active", true),
      supabaseAdmin
        .from("hire_requests")
        .select("id", { head: true, count: "exact" })
        .not("status", "in", "released,refunded,cancelled"),
      supabaseAdmin.from("hire_requests").select("id", { head: true, count: "exact" }).eq("status", "released"),
      supabaseAdmin.from("reports").select("id", { head: true, count: "exact" }).eq("status", "open"),
      supabaseAdmin.from("hire_requests").select("id", { head: true, count: "exact" }).eq("status", "disputed"),
      supabaseAdmin.from("hire_offers").select("id", { head: true, count: "exact" }).eq("status", "pending"),
      supabaseAdmin.from("profiles").select("pi_uid", { head: true, count: "exact" }).not("suspended_at", "is", null),
      supabaseAdmin.from("v_platform_earnings").select("*").single(),
      supabaseAdmin
        .from("v_platform_earnings_daily")
        .select("day, transaction_fees, boost_revenue, network_costs, net_earnings")
        .gte("day", since60)
        .order("day", { ascending: true }),
      supabaseAdmin.from("hire_requests").select("amount, status").in("status", ["locked", "delivered", "disputed"]),
      supabaseAdmin.from("hire_requests").select("status, payout_status, payout_locked_at"),
    ]);

    if (earningsRes.error) {
      console.error("[admin:dashboard] earnings view failed:", earningsRes.error.message);
      return NextResponse.json({ error: "Earnings view unavailable. Run migration 009." }, { status: 500 });
    }

    const num = (v: unknown) => Number(v) || 0;
    const e = earningsRes.data ?? {};

    const daily = (dailyRes.data ?? []) as Array<Record<string, unknown>>;
    type Totals = { transactionFees: number; boostRevenue: number; networkCosts: number; netEarnings: number };
    const empty: Totals = { transactionFees: 0, boostRevenue: 0, networkCosts: 0, netEarnings: 0 };
    const sum = (rows: Array<Record<string, unknown>>): Totals =>
      rows.reduce<Totals>(
        (acc, row) => ({
          transactionFees: acc.transactionFees + num(row.transaction_fees),
          boostRevenue: acc.boostRevenue + num(row.boost_revenue),
          networkCosts: acc.networkCosts + num(row.network_costs),
          netEarnings: acc.netEarnings + num(row.net_earnings),
        }),
        { ...empty },
      );
    const last30Rows = daily.filter((r) => String(r.day) >= since30);
    const prev30Rows = daily.filter((r) => String(r.day) >= since60 && String(r.day) < since30);
    const last30 = sum(last30Rows);
    const prev30 = sum(prev30Rows);

    const escrowRows = (escrowRes.data ?? []) as Array<{ amount: number | string }>;
    const escrowInFlight = escrowRows.reduce((s, r) => s + num(r.amount), 0);

    // Stale payout locks: released orders whose payout never confirmed but were
    // locked more than 10 minutes ago — the Reconcile work queue.
    const stalePayouts = (statusesRes.data ?? []).filter((r: Record<string, unknown>) => {
      if (r.status !== "released" || r.payout_status === "confirmed") return false;
      if (!r.payout_locked_at) return false;
      return now - new Date(String(r.payout_locked_at)).getTime() > 10 * 60 * 1000;
    }).length;

    const earnings = {
      transactionFees: num(e.transaction_fees),
      boostRevenue: num(e.boost_revenue),
      grossEarnings: num(e.gross_earnings),
      networkCosts: num(e.network_costs),
      netEarnings: num(e.net_earnings),
      grossVolume: num(e.gross_volume),
      providerPayouts: num(e.provider_payouts),
      releasedJobs: num(e.released_jobs),
      refundedJobs: num(e.refunded_jobs),
      boostsSold: num(e.boosts_sold),
      last30,
      prev30,
    };

    const series = last30Rows.map((r) => ({
      day: r.day,
      transactionFees: num(r.transaction_fees),
      boostRevenue: num(r.boost_revenue),
      networkCosts: num(r.network_costs),
      netEarnings: num(r.net_earnings),
    }));

    return NextResponse.json({
      counts: {
        users: Number(usersCount ?? 0),
        activeServices: Number(activeServicesCount ?? 0),
        openRequests: Number(openRequestsCount ?? 0),
        completedJobs: Number(completedJobsCount ?? 0),
        platformFeesCollected: earnings.transactionFees,
        totalBlockchainFees: earnings.networkCosts,
        totalPlatformNet: earnings.netEarnings,
        boostRevenue: earnings.boostRevenue,
        boostPurchaseCount: earnings.boostsSold,
      },
      earnings,
      series,
      escrow: { inFlight: escrowInFlight, openJobs: escrowRows.length },
      needsAttention: {
        openDisputes: Number(openDisputesCount ?? 0),
        openReports: Number(openReportsCount ?? 0),
        pendingOffers: Number(pendingOffersCount ?? 0),
        suspendedUsers: Number(suspendedCount ?? 0),
        stalePayouts,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return adminError(err, "dashboard");
  }
}
