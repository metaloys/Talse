import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";

/**
 * POST /api/messages/read
 * Body: { hireRequestId: string }
 *
 * Marks the caller's thread as read now. Only a participant on the request may
 * do this; the row is upserted into `conversation_reads`.
 */
export async function POST(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const body = await req.json().catch(() => ({}));
    const hireRequestId = typeof body?.hireRequestId === "string" ? body.hireRequestId : "";
    if (!hireRequestId) return NextResponse.json({ error: "Missing hireRequestId" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("hire_requests")
      .select("buyer_uid, provider_uid")
      .eq("id", hireRequestId)
      .single();
    if (error || !data) return NextResponse.json({ error: "Hire request not found" }, { status: 404 });
    if (data.buyer_uid !== me.uid && data.provider_uid !== me.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error: upErr } = await supabaseAdmin
      .from("conversation_reads")
      .upsert(
        { hire_request_id: hireRequestId, user_uid: me.uid, last_read_at: new Date().toISOString() },
        { onConflict: "hire_request_id,user_uid" },
      );
    if (upErr) {
      console.error("[messages] mark read failed:", upErr.message);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}