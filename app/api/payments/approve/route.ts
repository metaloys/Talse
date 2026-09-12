import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { checkRateLimit } from "@/lib/rate-limit";
import { approvePayment, getPayment } from "@/lib/pi-platform";

/**
 * Called from the client's Pi.createPayment onReadyForServerApproval callback:
 *   onReadyForServerApproval: (paymentId) => fetch('/api/payments/approve', { body: { paymentId, hireRequestId } })
 *
 * This is the escrow "lock" leg: the buyer pays the app's own Pi wallet
 * (a user_to_app payment). We approve it only if it matches the hire
 * request's amount and the caller is the buyer on that request.
 */
export async function POST(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    // per-user rate limit for payment approvals: 60 per hour
    if (!(await checkRateLimit(`${me.uid}:payments:approve`, 60, 3600))) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again later." }, { status: 429 });
    }
    const { paymentId, hireRequestId } = await req.json();
    if (!paymentId || !hireRequestId) {
      return NextResponse.json({ error: "Missing paymentId or hireRequestId" }, { status: 400 });
    }

    const { data: hr, error: fetchErr } = await supabaseAdmin
      .from("hire_requests")
      .select("id, buyer_uid, amount, status")
      .eq("id", hireRequestId)
      .single();
    if (fetchErr || !hr) return NextResponse.json({ error: "Hire request not found" }, { status: 404 });
    if (hr.buyer_uid !== me.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (hr.status !== "accepted") {
      return NextResponse.json({ error: `Cannot lock funds from status '${hr.status}'` }, { status: 409 });
    }

    // Cross-check the payment amount against the Pi Platform API directly —
    // never trust a client-reported amount.
    const payment = await getPayment(paymentId);
    if (Number(payment.amount) !== Number(hr.amount)) {
      return NextResponse.json({ error: "Payment amount does not match hire request" }, { status: 400 });
    }

    // Idempotency: if the Pi Platform payment record already shows the
    // developer approval flag, skip calling approvePayment() again.
    if (!payment?.status?.developer_approved) {
      await approvePayment(paymentId);
    }

    await supabaseAdmin
      .from("hire_requests")
      .update({ escrow_request_id: paymentId })
      .eq("id", hireRequestId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
