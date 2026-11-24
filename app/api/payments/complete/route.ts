import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { checkRateLimit } from "@/lib/rate-limit";
import { completePayment, getPayment } from "@/lib/pi-platform";
import { notifyUsers } from "@/lib/notify";
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
      .select("id, buyer_uid, provider_uid, escrow_request_id, status")
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
    // The payment must belong to the caller — same trust boundary as approve.
    if (payment?.user_uid !== me.uid) {
      return NextResponse.json({ error: "Payment does not belong to this user" }, { status: 403 });
    }
    // Prefer the txid recorded by the Pi Platform over the client-supplied one,
    // so the escrow audit trail cannot be corrupted by arbitrary client values.
    // (Pi validates the client txid inside completePayment above; when the
    // payment was already completed in a prior attempt, transaction?.txid is
    // the authoritative value. Fall back to the submitted txid when Pi has not
    // attached one yet.)
    const verifiedTxid = payment?.transaction?.txid ?? txid;

    const request = await finalizePaymentLock(hireRequestId, paymentId, verifiedTxid);

    // Tell the provider the money is safely held and work can start.
    try {
      await notifyUsers([
        {
          title: "Payment secured",
          body: `${me.username} funded the escrow. You can start the work.`,
          user_uid: hr.provider_uid,
          subroute: `/hire-requests/${hireRequestId}`,
        },
      ]);
    } catch (notifyErr) {
      console.error("[Notifications] escrow-funding notify failed:", notifyErr instanceof Error ? notifyErr.message : notifyErr);
    }

    return NextResponse.json({ request });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[payments:complete] failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
