import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError, writeAudit } from "@/lib/admin-route";

// PATCH /api/admin/disputes/[id] — non-monetary dispute actions: mark under
// investigation, escalate, or just save a note. For the two outcomes that
// actually move money (release to provider / refund buyer), use
// /api/admin/disputes/[id]/resolve instead. Role-aware and audited, like the
// other console mutations.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await authorizeAdmin(req, "disputes");

    const { stage, note } = await req.json();
    if (stage && !["investigating", "escalated"].includes(stage)) {
      return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    }

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("hire_requests")
      .select("status, dispute_stage, admin_note")
      .eq("id", id)
      .single();
    if (fetchErr || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status !== "disputed") {
      return NextResponse.json({ error: "Only disputed requests can be updated here" }, { status: 409 });
    }

    const update: Record<string, unknown> = {};
    if (stage) update.dispute_stage = stage;
    if (note !== undefined) {
      if (note !== null && typeof note !== "string") return NextResponse.json({ error: "Invalid admin note" }, { status: 400 });
      if (typeof note === "string" && note.trim().length > 1000) return NextResponse.json({ error: "Admin note must be at most 1000 characters." }, { status: 400 });
      update.admin_note = note;
    }

    const { data, error } = await supabaseAdmin
      .from("hire_requests")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAudit({
      adminUid: access.uid,
      action: "dispute.update",
      targetType: "dispute",
      targetId: id,
      previousState: { dispute_stage: existing.dispute_stage, admin_note: existing.admin_note },
      newState: { dispute_stage: stage ?? existing.dispute_stage, admin_note: note !== undefined ? note : existing.admin_note },
      reason: typeof note === "string" ? note : null,
    });

    return NextResponse.json({ request: data });
  } catch (err) {
    return adminError(err, "dispute-update");
  }
}
