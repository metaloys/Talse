import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const { data, error } = await supabaseAdmin
      .from("hire_requests")
      .select("*, services(title, images, price)")
      .eq("id", params.id)
      .single();
    if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (data.buyer_uid !== me.uid && data.provider_uid !== me.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ request: data });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Status transitions that don't involve money:
//   pending   -> accepted   (provider)
//   pending   -> cancelled  (buyer or provider)
//   locked    -> delivered  (provider marks work delivered)
//   any       -> disputed   (either party)
// "locked" (escrow funded) and "released"/"refunded" are NOT set here — those
// only happen via /api/payments/* once a real payment/contract call confirms
// on-chain. This route never lets a client claim money moved.
const ALLOWED_TRANSITIONS: Record<string, { from: string[]; by: "buyer" | "provider" | "either" }> = {
  accepted: { from: ["pending"], by: "provider" },
  cancelled: { from: ["pending", "accepted"], by: "either" },
  delivered: { from: ["locked"], by: "provider" },
  disputed: { from: ["locked", "delivered"], by: "either" },
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const { status: nextStatus, reason, details, evidence } = await req.json();

    const rule = ALLOWED_TRANSITIONS[nextStatus];
    if (!rule) {
      return NextResponse.json({ error: `Unsupported transition to '${nextStatus}'` }, { status: 400 });
    }

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("hire_requests")
      .select("buyer_uid, provider_uid, status")
      .eq("id", params.id)
      .single();
    if (fetchErr || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isBuyer = existing.buyer_uid === me.uid;
    const isProvider = existing.provider_uid === me.uid;
    if (!isBuyer && !isProvider) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (rule.by === "buyer" && !isBuyer) return NextResponse.json({ error: "Only the buyer may do this" }, { status: 403 });
    if (rule.by === "provider" && !isProvider) return NextResponse.json({ error: "Only the provider may do this" }, { status: 403 });
    if (!rule.from.includes(existing.status)) {
      return NextResponse.json(
        { error: `Cannot move from '${existing.status}' to '${nextStatus}'` },
        { status: 409 }
      );
    }

    const update: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === "disputed") {
      update.dispute_filed_by = me.uid;
      update.dispute_reason = typeof reason === "string" ? reason.slice(0, 200) : null;
      update.dispute_details = typeof details === "string" ? details.slice(0, 4000) : null;
      update.dispute_evidence = Array.isArray(evidence) ? evidence.slice(0, 10) : [];
      update.dispute_stage = null; // reset — a fresh dispute always starts unreviewed
      update.admin_note = null;
    }

    const { data, error } = await supabaseAdmin
      .from("hire_requests")
      .update(update)
      .eq("id", params.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ request: data });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
