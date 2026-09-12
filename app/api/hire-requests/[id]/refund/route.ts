import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { payoutHireRequest, PayoutNotConfiguredError, PayoutWalletBusyError, PayoutWalletLeaseLostError } from "@/lib/dispute-resolution";

/**
 * Self-service refund path. The real rule is intentionally narrow:
 * - locked: either party may self-service refund
 * - delivered: only the provider may voluntarily refund; the buyer must use
 *   /release or open a dispute, never self-refund
 * - disputed: admin resolution only
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const { id } = await params;

    const { data: hr, error: fetchErr } = await supabaseAdmin
      .from("hire_requests")
      .select("id, buyer_uid, provider_uid, status")
      .eq("id", id)
      .single();
    if (fetchErr || !hr) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (hr.buyer_uid !== me.uid && hr.provider_uid !== me.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (hr.status === "delivered" && me.uid === hr.buyer_uid) {
      return NextResponse.json(
        { error: "Buyer cannot self-refund after delivery; use /release or open a dispute instead." },
        { status: 403 }
      );
    }

    if (hr.status === "delivered" && me.uid === hr.provider_uid) {
      const data = await payoutHireRequest({ hireRequestId: id, favor: "buyer" });
      return NextResponse.json({ request: data });
    }

    if (hr.status !== "locked") {
      return NextResponse.json(
        { error: `Cannot self-service refund from status '${hr.status}' — use dispute resolution instead` },
        { status: 409 }
      );
    }

    const data = await payoutHireRequest({ hireRequestId: id, favor: "buyer" });
    return NextResponse.json({ request: data });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PayoutNotConfiguredError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PayoutWalletBusyError || err instanceof PayoutWalletLeaseLostError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
