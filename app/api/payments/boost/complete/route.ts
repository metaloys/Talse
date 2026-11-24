import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { checkRateLimit } from "@/lib/rate-limit";
import { completePayment, getPayment } from "@/lib/pi-platform";
import { verifyBoostPayment } from "@/lib/boost-verify";

/**
 * POST /api/payments/boost/complete  { paymentId, txid, serviceId }
 *
 * Server-side completion for a boost payment. After this succeeds the client
 * calls POST /api/services/[id]/boost, which verifies the payment again and
 * writes boosted_until + boost_purchases (the ledger row).
 */
export async function POST(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    if (!(await checkRateLimit(`${me.uid}:boost:complete`, 20, 3600))) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const { paymentId, txid, serviceId } = body ?? {};
    if (!paymentId || !txid || !serviceId) {
      return NextResponse.json({ error: "Missing paymentId, txid or serviceId" }, { status: 400 });
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
    const problem = verifyBoostPayment(payment, serviceId, me.uid);
    if (problem) return NextResponse.json({ error: problem.error }, { status: problem.status });

    if (!payment.status?.developer_completed) {
      await completePayment(paymentId, txid);
    }
    const verifiedTxid = payment.transaction?.txid ?? txid;
    return NextResponse.json({ ok: true, txid: verifiedTxid });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[boost:complete] failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
