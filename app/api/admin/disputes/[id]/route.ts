import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { requireAdmin, NotAdminError } from "@/lib/admin";

// PATCH /api/admin/disputes/[id] — non-monetary dispute actions: mark under
// investigation, escalate, or just save a note. For the two outcomes that
// actually move money (release to provider / refund buyer), use
// /api/admin/disputes/[id]/resolve instead.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    requireAdmin(me.uid);

    const { stage, note } = await req.json();
    if (stage && !["investigating", "escalated"].includes(stage)) {
      return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    }

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("hire_requests")
      .select("status")
      .eq("id", params.id)
      .single();
    if (fetchErr || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status !== "disputed") {
      return NextResponse.json({ error: "Only disputed requests can be updated here" }, { status: 409 });
    }

    const update: Record<string, unknown> = {};
    if (stage) update.dispute_stage = stage;
    if (note !== undefined) update.admin_note = note;

    const { data, error } = await supabaseAdmin
      .from("hire_requests")
      .update(update)
      .eq("id", params.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ request: data });
  } catch (err) {
    if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
