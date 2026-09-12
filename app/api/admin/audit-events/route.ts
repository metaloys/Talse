import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { requireAdmin, NotAdminError } from "@/lib/admin";

export async function GET(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    requireAdmin(me.uid);

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const perPage = Math.min(50, Math.max(1, Number(searchParams.get("perPage") ?? "20")));
    const targetType = searchParams.get("target_type");
    const action = searchParams.get("action");
    const offset = (page - 1) * perPage;

    const allowedTargetTypes = new Set(["user", "service", "review"]);
    if (targetType && !allowedTargetTypes.has(targetType)) {
      return NextResponse.json({ error: "Invalid target_type filter" }, { status: 400 });
    }

    let query = supabaseAdmin
      .from("admin_audit_events")
      .select("id, admin_uid, action, target_type, target_id, details, created_at, admin:profiles!admin_audit_events_admin_uid_fkey(username, display_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    if (targetType) query = query.eq("target_type", targetType);
    if (action) query = query.eq("action", action);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []).map((row: any) => {
      const details = row.details && typeof row.details === "object" ? row.details : {};
      const reason = typeof details.reason === "string" ? details.reason : null;
      return {
        ...row,
        admin: row.admin ?? null,
        reason,
        previous_state: details.previous_state ?? null,
        new_state: details.new_state ?? null,
      };
    });

    return NextResponse.json({ auditEvents: rows, count: count ?? undefined });
  } catch (err) {
    if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
