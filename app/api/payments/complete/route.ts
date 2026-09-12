import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { checkRateLimit } from "@/lib/rate-limit";
import { completePayment, getPayment } from "@/lib/pi-platform";
import { finalizePaymentLock } from "@/lib/dispute-resolution";

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
    // per-user rate limit for payment completions: 60 per hour
    if (!(await checkRateLimit(`${me.uid}:payments:complete`, 60, 3600))) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again later." }, { status: 429 });
    }
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

    // Fetch the payment record and skip double-completing if already done.
    const payment = await getPayment(paymentId);
    if (!payment?.status?.developer_completed) {
      await completePayment(paymentId, txid);
    }

    const request = await finalizePaymentLock(hireRequestId, paymentId, txid);
    return NextResponse.json({ request });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
