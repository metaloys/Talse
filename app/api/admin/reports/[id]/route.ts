import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError, writeAudit } from "@/lib/admin-route";

// PATCH /api/admin/reports/:id - update status/admin_note/resolved_by (admin only)
// Now records an audit row so report decisions are attributable like every
// other moderation action.
export async function PATCH(req: NextRequest) {
  try {
    const access = await authorizeAdmin(req, "reports");

    const url = new URL(req.url);
    const id = url.pathname.split("/").pop();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { data: before } = await supabaseAdmin.from("reports").select("status, admin_note").eq("id", id).maybeSingle();
    if (!before) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const allowed: { status?: string; admin_note?: string; resolved_by?: string } = {};
    if (typeof body.status === "string") allowed.status = body.status;
    if (typeof body.admin_note === "string") allowed.admin_note = body.admin_note;

    // If status is set to resolved, record the resolving admin UID
    if (allowed.status === "resolved") {
      allowed.resolved_by = access.uid;
    }

    const { data, error } = await supabaseAdmin.from("reports").update(allowed).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAudit({
      adminUid: access.uid,
      action: allowed.status ? `report.${allowed.status}` : "report.update",
      targetType: "report",
      targetId: id,
      previousState: before,
      newState: { status: allowed.status, admin_note: allowed.admin_note },
      reason: allowed.admin_note ?? null,
    });

    return NextResponse.json({ report: data });
  } catch (err) {
    return adminError(err, "report-update");
  }
}
