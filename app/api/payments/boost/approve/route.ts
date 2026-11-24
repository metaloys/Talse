import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { checkRateLimit } from "@/lib/rate-limit";
import { approvePayment, getPayment } from "@/lib/pi-platform";
import { verifyBoostPayment } from "@/lib/boost-verify";
import { getBoostPricePi } from "@/lib/platform-settings";

/**
 * POST /api/payments/boost/approve  { paymentId, serviceId }
 *
 * Server-side approval for a featured-listing boost paid with native Pi
 * payments (same mechanism as escrow, no legacy product backend involved).
 * Verifies the caller owns the listing and that the payment is really a boost
 * payment for that listing at the configured price before approving it.
 */
export async function POST(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    if (!(await checkRateLimit(`${me.uid}:boost:approve`, 20, 3600))) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const { paymentId, serviceId } = await req.json().catch(() => ({}));
    if (!paymentId || !serviceId) {
      return NextResponse.json({ error: "Missing paymentId or serviceId" }, { status: 400 });
    }

    const { data: service, error: svcErr } = await supabaseAdmin
      .from("services")
      .select("id, owner_uid")
      .eq("id", serviceId)
      .single();
    if (svcErr || !service) return NextResponse.json({ error: "Service not found" }, { status: 404 });
    if (service.owner_uid !== me.uid) {
      return NextResponse.json({ error: "Only the listing owner can boost it" }, { status: 403 });
    }

    const payment = await getPayment(paymentId);
    // The price is admin-configurable; validate against the live setting rather
    // than the compile-time constant so a price change is enforced immediately.
    const problem = verifyBoostPayment(payment, serviceId, me.uid, await getBoostPricePi());
    if (problem) return NextResponse.json({ error: problem.error }, { status: problem.status });

    if (!payment.status?.developer_approved) {
      await approvePayment(paymentId);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[boost:approve] failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
