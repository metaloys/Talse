import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { requireAdmin, NotAdminError } from "@/lib/admin";

// GET /api/admin/audit-events?target_type=&action=&admin_uid=&range=&page=&perPage=
//
// The audit log feeds the Governance screen and, importantly, the per-entity
// drawers. This route previously selected a `details` column that does not
// exist in the schema, so the Audit tab could never load; it now reads the real
// columns (previous_state / new_state / reason) and supports richer filters.

export async function GET(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    requireAdmin(me.uid);

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const perPage = Math.min(100, Math.max(1, Number(searchParams.get("perPage") ?? "20")));
    const targetType = searchParams.get("target_type");
    const action = searchParams.get("action");
    const adminUid = searchParams.get("admin_uid");
    const range = searchParams.get("range");
    const offset = (page - 1) * perPage;

    let query = supabaseAdmin
      .from("admin_audit_events")
      .select(
        "id, admin_uid, action, target_type, target_id, previous_state, new_state, reason, created_at, admin:profiles!admin_audit_events_admin_uid_fkey(username, display_name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    if (targetType && targetType !== "all") query = query.eq("target_type", targetType);
    if (action) query = query.eq("action", action);
    if (adminUid) query = query.eq("admin_uid", adminUid);
    if (range && range !== "all") {
      query = query.gte("created_at", new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000).toISOString());
    }

    const { data, error, count } = await query;
    if (error) {
      console.error("[admin:audit] failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      auditEvents: data ?? [],
      count: count ?? undefined,
      page,
      perPage,
    });
  } catch (err) {
    if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
