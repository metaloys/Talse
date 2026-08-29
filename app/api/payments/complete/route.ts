import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { completePayment } from "@/lib/pi-platform";

/**
 * Called from the client's Pi.createPayment onReadyForServerCompletion callback:
 *   onReadyForServerCompletion: (paymentId, txid) =>
 *     fetch('/api/payments/complete', { body: { paymentId, txid, hireRequestId } })
 *
 * Marks the hire request 'locked' — funds are now held by the app's escrow
 * wallet, awaiting delivery + buyer confirmation before release.
 */
export async function POST(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const { paymentId, txid, hireRequestId } = await req.json();
    if (!paymentId || !txid || !hireRequestId) {
      return NextResponse.json({ error: "Missing paymentId, txid or hireRequestId" }, { status: 400 });
    }

    const { data: hr, error: fetchErr } = await supabaseAdmin
      .from("hire_requests")
      .select("id, buyer_uid, escrow_request_id, status")
      .eq("id", hireRequestId)
      .single();
    if (fetchErr || !hr) return NextResponse.json({ error: "Hire request not found" }, { status: 404 });
    if (hr.buyer_uid !== me.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (hr.escrow_request_id !== paymentId) {
      return NextResponse.json({ error: "paymentId does not match the approved payment" }, { status: 400 });
    }

    await completePayment(paymentId, txid);

    const { data, error } = await supabaseAdmin
      .from("hire_requests")
      .update({ status: "locked", lock_txid: txid })
      .eq("id", hireRequestId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ request: data });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
