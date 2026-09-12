import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { requireAdmin, NotAdminError } from "@/lib/admin";

export async function GET(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    requireAdmin(me.uid);

    const [{ count: usersCount }, { count: activeServicesCount }, { count: openRequestsCount }, { count: completedJobsCount }, feesRes, accountingRes, boostRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { head: true, count: "exact" }),
      supabaseAdmin.from("services").select("id", { head: true, count: "exact" }).eq("active", true),
      supabaseAdmin.from("hire_requests").select("id", { head: true, count: "exact" }).not("status", "in", "released,refunded,cancelled"),
      supabaseAdmin.from("hire_requests").select("id", { head: true, count: "exact" }).eq("status", "released"),
      supabaseAdmin.from("hire_requests").select("platform_fee"),
      // v_platform_accounting: view that exposes platform_fee, blockchain_fee, platform_net
      supabaseAdmin.from("v_platform_accounting").select("platform_fee, blockchain_fee, platform_net"),
      // boost_purchases: simple table with amount per purchase
      supabaseAdmin.from("boost_purchases").select("amount"),
    ]);

    if (feesRes.error) return NextResponse.json({ error: feesRes.error.message }, { status: 500 });
    if (accountingRes.error) return NextResponse.json({ error: accountingRes.error.message }, { status: 500 });
    if (boostRes.error) return NextResponse.json({ error: boostRes.error.message }, { status: 500 });

    const totalFees = (feesRes.data ?? []).reduce((s: number, r: any) => s + (Number(r.platform_fee) || 0), 0);
    const totalBlockchainFees = (accountingRes.data ?? []).reduce((s: number, r: any) => s + (Number(r.blockchain_fee) || 0), 0);
    const totalPlatformNet = (accountingRes.data ?? []).reduce((s: number, r: any) => s + (Number(r.platform_net) || 0), 0);
    const boostRevenue = (boostRes.data ?? []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
    const boostPurchaseCount = (boostRes.data ?? []).length;

    return NextResponse.json({
      counts: {
        users: Number(usersCount ?? 0),
        activeServices: Number(activeServicesCount ?? 0),
        openRequests: Number(openRequestsCount ?? 0),
        completedJobs: Number(completedJobsCount ?? 0),
        platformFeesCollected: totalFees,
        totalBlockchainFees,
        totalPlatformNet,
        boostRevenue,
        boostPurchaseCount,
      },
    });
  } catch (err) {
    if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
