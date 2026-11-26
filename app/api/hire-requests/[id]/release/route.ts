import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { PayoutNotConfiguredError, PayoutWalletBusyError, PayoutWalletLeaseLostError } from "@/lib/dispute-resolution";
import { getSettlement, SettlementNotSupportedError } from "@/lib/settlement";

/**
 * Buyer confirms delivery -> release funds to the provider.
 *
 * CONTRACT SEAM: the actual release goes through the Settlement seam
 * (lib/settlement) so escrow (A2U, Testnet) and p2p (direct Pioneer-to-Pioneer,
 * Mainnet) share this route. The escrow implementation delegates to
 * payoutHireRequest() — the single place the custodial A2U call happens.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const { id } = await params;

    const { data: hr, error: fetchErr } = await supabaseAdmin
      .from("hire_requests")
      .select("id, buyer_uid, status")
      .eq("id", id)
      .single();
    if (fetchErr || !hr) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (hr.buyer_uid !== me.uid) return NextResponse.json({ error: "Only the buyer can release funds" }, { status: 403 });
    if (hr.status !== "delivered") {
      return NextResponse.json({ error: `Cannot release from status '${hr.status}'` }, { status: 409 });
    }
    const data = await getSettlement().release({ hireRequestId: id, favor: "provider" });
    return NextResponse.json({ request: data });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof SettlementNotSupportedError) return NextResponse.json({ error: err.message }, { status: 409 });
    if (err instanceof PayoutNotConfiguredError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PayoutWalletBusyError || err instanceof PayoutWalletLeaseLostError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[release] failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
