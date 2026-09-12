import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { requireAdmin, NotAdminError } from "@/lib/admin";

// PATCH /api/admin/reports/:id - update status/admin_note/resolved_by (admin only)
export async function PATCH(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    requireAdmin(me.uid);

    const url = new URL(req.url);
    const id = url.pathname.split("/").pop();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const allowed: any = {};
    if (typeof body.status === "string") allowed.status = body.status;
    if (typeof body.admin_note === "string") allowed.admin_note = body.admin_note;

    // If status is set to resolved, record the resolving admin UID
    if (allowed.status === "resolved") {
      allowed.resolved_by = me.uid;
    }

    const { data, error } = await supabaseAdmin.from("reports").update(allowed).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ report: data });
  } catch (err) {
    if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
