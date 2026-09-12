import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { checkRateLimit } from "@/lib/rate-limit";
import { getPayment, completePayment, cancelPayment } from "@/lib/pi-platform";
import { isAdmin } from "@/lib/admin";
import { finalizePaymentLock } from "@/lib/dispute-resolution";

async function assertPaymentAccessForUser(uid: string, hireRequestId: string | null | undefined) {
  if (!hireRequestId) return false;
  if (isAdmin(uid)) return true;

  const { data, error } = await supabaseAdmin
    .from("hire_requests")
    .select("buyer_uid, provider_uid")
    .eq("id", hireRequestId)
    .single();

  if (error || !data) return false;
  return data.buyer_uid === uid || data.provider_uid === uid;
}

export async function POST(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    // per-user rate limit for payment recover operations: 60 per hour
    if (!(await checkRateLimit(`${me.uid}:payments:recover`, 60, 3600))) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again later." }, { status: 429 });
    }
    const { paymentId } = await req.json();
    if (!paymentId) return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });

    const payment = await getPayment(paymentId);
    const hireRequestId = payment?.metadata?.hireRequestId ?? null;

    const allowed = await assertPaymentAccessForUser(me.uid, hireRequestId);
    if (!allowed) {
      return NextResponse.json({ error: "This payment does not belong to you" }, { status: 403 });
    }

    const txid = payment?.txid ?? payment?.transaction?.txid ?? payment?.transaction_hash ?? null;
    const verified = payment?.transaction_verified === true || !!txid || payment?.status === "complete";

    if (verified) {
      try {
        if (!txid) {
          return NextResponse.json({ status: "complete_failed", error: "Payment verified but missing txid" }, { status: 409 });
        }
        await completePayment(paymentId, txid);
        const finalRow = await finalizePaymentLock(hireRequestId, paymentId, txid);
        return NextResponse.json({ status: "completed", paymentId, request: finalRow });
      } catch (err) {
        console.error("Failed to complete payment during recovery", err);
        return NextResponse.json({ status: "complete_failed", error: String(err) }, { status: 500 });
      }
    }

    try {
      await cancelPayment(paymentId);
      return NextResponse.json({ status: "cancelled", paymentId });
    } catch (err) {
      console.error("Failed to cancel stale payment", err);
      return NextResponse.json({ status: "cancel_failed", error: String(err) }, { status: 500 });
    }
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
