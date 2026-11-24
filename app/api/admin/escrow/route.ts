import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError, paging } from "@/lib/admin-route";

// GET /api/admin/escrow — the money-control screen.
//
//   accounting   one ledger row per settled order (v_platform_accounting):
//                amount, platform_fee, worker_payout, blockchain_fee,
//                platform_net, accounting_status, release/refund txids
//   inFlight     Pi held for jobs not yet finished — a liability, never revenue
//   stuckPayouts rows whose payout lock looks abandoned: the Reconcile action's
//                work queue (a payout can hang if the process dies between
//                acquiring the wallet lease and confirming the transfer)
//   wallet       current payout wallet lease state
//
// Reconcile itself lives at POST /api/admin/payments/[hireRequestId]/reconcile.

const OPEN_STATUSES = ["locked", "delivered", "disputed"];
const STUCK_AFTER_MS = 10 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "escrow");

    const url = new URL(req.url);
    const { page, perPage, from, to } = paging(url, 25);

    const [ledgerRes, inFlightRes, statusesRes, leaseRes] = await Promise.all([
      supabaseAdmin
        .from("v_platform_accounting")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to),
      supabaseAdmin.from("hire_requests").select("amount, status").in("status", OPEN_STATUSES),
      supabaseAdmin.from("hire_requests").select("id, status, amount, payout_status, payout_locked_at"),
      supabaseAdmin.from("payout_wallet_lease").select("*").eq("wallet_id", "app_wallet").maybeSingle(),
    ]);

    if (ledgerRes.error) {
      console.error("[admin:escrow] ledger failed:", ledgerRes.error.message);
      return NextResponse.json({ error: "Accounting view unavailable. Run migration 009." }, { status: 500 });
    }

    const num = (v: unknown) => Number(v) || 0;
    const inFlightRows = inFlightRes.data ?? [];
    const inFlight = inFlightRows.reduce((s, r: { amount: number | string }) => s + num(r.amount), 0);

    const all = statusesRes.data ?? [];
    const now = Date.now();
    const stuckPayouts = all.filter((r: { payout_status?: string | null; payout_locked_at?: string | null; status: string }) => {
      if (r.status !== "released") return false;
      if (r.payout_status === "confirmed") return false;
      if (!r.payout_locked_at) return false;
      return now - new Date(r.payout_locked_at).getTime() > STUCK_AFTER_MS;
    });

    const payoutSummary = {
      confirmed: all.filter((r: { payout_status?: string | null }) => r.payout_status === "confirmed").length,
      pending: all.filter((r: { payout_status?: string | null; status: string }) => r.status === "released" && r.payout_status !== "confirmed").length,
      failed: all.filter((r: { payout_status?: string | null }) => r.payout_status === "failed").length,
    };

    const lease = leaseRes.data
      ? {
          locked: Boolean(leaseRes.data.lease_owner) && new Date(leaseRes.data.lease_expires_at ?? 0).getTime() > now,
          owner: leaseRes.data.lease_owner ?? null,
          acquiredAt: leaseRes.data.lease_acquired_at ?? null,
          expiresAt: leaseRes.data.lease_expires_at ?? null,
        }
      : { locked: false, owner: null, acquiredAt: null, expiresAt: null };

    return NextResponse.json({
      ledger: ledgerRes.data ?? [],
      count: Number(ledgerRes.count ?? 0),
      page,
      perPage,
      inFlight: { total: inFlight, openJobs: inFlightRows.length },
      stuckPayouts,
      payoutSummary,
      wallet: lease,
    });
  } catch (err) {
    return adminError(err, "escrow");
  }
}
