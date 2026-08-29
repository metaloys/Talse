import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { getPayment } from "@/lib/pi-platform";

// POST /api/services/[id]/boost — called after sdk.makePurchase() resolves
// with result.ok, passing paymentId/txid. Verifies the payment server-side
// before trusting it (client-reported success is never sufficient), then
// sets boosted_until 7 days out per boost-listing.tsx's stated duration.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const { paymentId, txid } = await req.json();
    if (!paymentId) return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });

    const { data: service, error: fetchErr } = await supabaseAdmin
      .from("services")
      .select("owner_uid")
      .eq("id", params.id)
      .single();
    if (fetchErr || !service) return NextResponse.json({ error: "Service not found" }, { status: 404 });
    if (service.owner_uid !== me.uid) {
      return NextResponse.json({ error: "Forbidden: not the owner of this service" }, { status: 403 });
    }

    const payment = await getPayment(paymentId);
    if (payment.user_uid !== me.uid || payment.user_uid !== service.owner_uid) {
      return NextResponse.json({ error: "Payment does not belong to the service owner" }, { status: 403 });
    }
    if (!payment.status?.developer_completed) {
      return NextResponse.json({ error: "Payment not completed" }, { status: 409 });
    }

    // TOCTOU note: services are not reassigned mid-request in this product flow,
    // so the ownership check is low-risk compared to the payout race in
    // lib/dispute-resolution.ts. The service owner is still verified immediately
    // before the update, then the row update is bound to the same service id.
    const boostedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: updateErr } = await supabaseAdmin
      .from("services")
      .update({ boosted_until: boostedUntil })
      .eq("id", params.id)
      .eq("owner_uid", service.owner_uid);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    await supabaseAdmin.from("boost_purchases").insert({
      service_id: params.id,
      buyer_uid: me.uid,
      payment_id: paymentId,
      txid: txid ?? payment.transaction?.txid ?? null,
      amount: payment.amount,
    });

    return NextResponse.json({ boostedUntil });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
