import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { requireAdmin, NotAdminError } from "@/lib/admin";

// GET /api/admin/dashboard
//
// Returns operational counts plus the platform's money picture:
//   earnings      — lifetime, per source (transaction fees, boosts) and costs
//   earnings.last30 — same, last 30 days
//   escrow        — Pi currently held for jobs in progress (not revenue)
export async function GET(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    requireAdmin(me.uid);

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [
      { count: usersCount },
      { count: activeServicesCount },
      { count: openRequestsCount },
      { count: completedJobsCount },
      earningsRes,
      last30Res,
      escrowRes,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { head: true, count: "exact" }),
      supabaseAdmin.from("services").select("id", { head: true, count: "exact" }).eq("active", true),
      supabaseAdmin
        .from("hire_requests")
        .select("id", { head: true, count: "exact" })
        .not("status", "in", "released,refunded,cancelled"),
      supabaseAdmin.from("hire_requests").select("id", { head: true, count: "exact" }).eq("status", "released"),
      // Lifetime P&L: transaction fees + boost revenue - network costs.
      supabaseAdmin.from("v_platform_earnings").select("*").single(),
      // Daily P&L rolled up over the last 30 days.
      supabaseAdmin
        .from("v_platform_earnings_daily")
        .select("transaction_fees, boost_revenue, network_costs, net_earnings")
        .gte("day", since),
      // Pi held in escrow for jobs that are not finished yet. This is a
      // liability, not revenue, and must never be counted as earnings.
      supabaseAdmin.from("hire_requests").select("amount, status").in("status", ["locked", "delivered", "disputed"]),
    ]);

    if (earningsRes.error) {
      console.error("[admin:dashboard] earnings view failed:", earningsRes.error.message);
      return NextResponse.json({ error: "Earnings view unavailable. Run migration 009." }, { status: 500 });
    }

    const e = earningsRes.data ?? {};
    const num = (v: unknown) => Number(v) || 0;

    const last30 = (last30Res.data ?? []).reduce(
      (acc: { transactionFees: number; boostRevenue: number; networkCosts: number; netEarnings: number }, row: any) => ({
        transactionFees: acc.transactionFees + num(row.transaction_fees),
        boostRevenue: acc.boostRevenue + num(row.boost_revenue),
        networkCosts: acc.networkCosts + num(row.network_costs),
        netEarnings: acc.netEarnings + num(row.net_earnings),
      }),
      { transactionFees: 0, boostRevenue: 0, networkCosts: 0, netEarnings: 0 },
    );

    const escrowRows = escrowRes.data ?? [];
    const escrowInFlight = escrowRows.reduce((s: number, r: any) => s + num(r.amount), 0);

    const earnings = {
      // money in
      transactionFees: num(e.transaction_fees),
      boostRevenue: num(e.boost_revenue),
      grossEarnings: num(e.gross_earnings),
      // money out
      networkCosts: num(e.network_costs),
      // bottom line
      netEarnings: num(e.net_earnings),
      // context
      grossVolume: num(e.gross_volume),
      providerPayouts: num(e.provider_payouts),
      releasedJobs: num(e.released_jobs),
      refundedJobs: num(e.refunded_jobs),
      boostsSold: num(e.boosts_sold),
      last30,
    };

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
      escrow: { inFlight: escrowInFlight, openJobs: escrowRows.length },
    });
  } catch (err) {
    if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
