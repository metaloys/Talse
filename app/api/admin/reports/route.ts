import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError } from "@/lib/admin-route";

// GET /api/admin/reports?page=1&perPage=20&status=open
export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "reports");

    const url = new URL(req.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const perPage = Number(url.searchParams.get("perPage") ?? "20");
    const status = url.searchParams.get("status");

    const from = (Math.max(1, page) - 1) * perPage;
    const to = from + perPage - 1;

    let query = supabaseAdmin
      .from("reports")
      .select("*, reporter:profiles!reports_reporter_uid_fkey(username, display_name), resolver:profiles!reports_resolved_by_fkey(username, display_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status) query = query.eq("status", status);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ reports: data ?? [], count: count ?? undefined });
  } catch (err) {
    return adminError(err, "reports");
  }
}
