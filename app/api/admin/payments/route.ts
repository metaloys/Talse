import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { requireAdmin, NotAdminError } from "@/lib/admin";

export async function GET(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    requireAdmin(me.uid);

    // hire_requests with release_txid or refund_txid, plus boost_purchases
    const [hrRes, boostRes] = await Promise.all([
      // Use `updated_at` (exists) rather than `released_at` (does not exist in schema)
      supabaseAdmin.from("hire_requests").select("id, service_id, buyer_uid, provider_uid, release_txid, refund_txid, updated_at").or('release_txid.not.is.null,refund_txid.not.is.null'),
      supabaseAdmin.from("boost_purchases").select("id, service_id, buyer_uid, amount, txid, created_at"),
    ]);

    if (hrRes.error) return NextResponse.json({ error: hrRes.error.message }, { status: 500 });
    if (boostRes.error) return NextResponse.json({ error: boostRes.error.message }, { status: 500 });

    const merged = [
      ...(hrRes.data ?? []).map((r: any) => ({
        type: "hire_request",
        id: r.id,
        service_id: r.service_id,
        buyer_uid: r.buyer_uid,
        provider_uid: r.provider_uid,
        txid: r.release_txid ?? r.refund_txid ?? null,
        // The schema doesn't include `released_at`; use existing `updated_at` as the record timestamp.
        date: r.updated_at ?? null,
      })),
      ...(boostRes.data ?? []).map((b: any) => ({
        type: "boost",
        id: b.id,
        service_id: b.service_id,
        buyer_uid: b.buyer_uid,
        txid: b.txid,
        amount: b.amount,
        date: b.created_at,
      })),
    ].sort((a: any, b: any) => (new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()));

    return NextResponse.json({ payments: merged });
  } catch (err) {
    if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
