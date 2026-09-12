import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { requireAdmin, NotAdminError } from "@/lib/admin";

export async function GET(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    requireAdmin(me.uid);

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("search") ?? undefined;
    const page = Number(searchParams.get("page") ?? "1");
    const perPage = Math.min(100, Math.max(1, Number(searchParams.get("perPage") ?? "50")));
    const offset = (page - 1) * perPage;

    let query = supabaseAdmin
      .from("profiles")
      .select("pi_uid, username, display_name, rating_avg, rating_count, created_at, suspended_at, suspension_reason")
      .order("created_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    if (q) {
      query = query.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ users: data ?? [] });
  } catch (err) {
    if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
