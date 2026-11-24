import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { requireAdmin, NotAdminError } from "@/lib/admin";

// GET /api/admin/users?search=&page=&perPage=&filter=
//
// Reads v_users_admin (migration 011), which adds the activity counts the
// console's Users and Providers screens need — completed jobs, earnings, refunds
// against, opt-in report counts — so one request gives a usable table.

export async function GET(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    requireAdmin(me.uid);

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("search") ?? undefined;
    const filter = searchParams.get("filter");
    const page = Number(searchParams.get("page") ?? "1");
    const perPage = Math.min(100, Math.max(1, Number(searchParams.get("perPage") ?? "50")));
    const offset = (page - 1) * perPage;

    let query = supabaseAdmin
      .from("v_users_admin")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    if (q) query = query.or(`username.ilike.%${q}%,display_name.ilike.%${q}%,pi_uid.ilike.%${q}%`);
    if (filter === "suspended") query = query.not("suspended_at", "is", null);
    if (filter === "providers") query = query.gt("active_listings", 0);

    const { data, error } = await query;
    if (error) {
      console.error("[admin:users] list failed:", error.message);
      return NextResponse.json({ error: "Users view unavailable. Run migration 011." }, { status: 500 });
    }

    return NextResponse.json({ users: data ?? [], page, perPage });
  } catch (err) {
    if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
