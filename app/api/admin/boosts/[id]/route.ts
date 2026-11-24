import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError, writeAudit } from "@/lib/admin-route";

// POST /api/admin/boosts/[id] — revoke an active boost.
//
// Abuse control: a listing boosted with a fraudulent payment, or the wrong
// listing boosted, can be pulled back before its window expires. This ends the
// boost window only; it does not move or refund Pi, so the payment ledger stays
// intact. Revoking an already-expired boost is a no-op that still returns the
// current state.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await authorizeAdmin(req, "boosts");
    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    if (!reason) return NextResponse.json({ error: "A reason is required." }, { status: 400 });

    const { data: boost, error: fetchErr } = await supabaseAdmin
      .from("boost_purchases")
      .select("id, service_id, buyer_uid, amount")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!boost) return NextResponse.json({ error: "Boost not found" }, { status: 404 });

    const nowIso = new Date().toISOString();
    const { error: updateErr } = await supabaseAdmin
      .from("services")
      .update({ boosted_until: nowIso })
      .eq("id", boost.service_id);
    if (updateErr) throw updateErr;

    await writeAudit({
      adminUid: access.uid,
      action: "boost.revoke",
      targetType: "boost",
      targetId: id,
      previousState: { serviceId: boost.service_id, amount: boost.amount },
      newState: { boosted_until: nowIso },
      reason,
    });

    return NextResponse.json({ ok: true, boostedUntil: nowIso });
  } catch (err) {
    return adminError(err, "boosts");
  }
}
