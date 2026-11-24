import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError, paging, ilikeSafe } from "@/lib/admin-route";

// GET /api/admin/users?search=&page=&perPage=&filter=
//
// Reads v_users_admin (migration 011), which adds the activity counts the
// console's Users and Providers screens need — completed jobs, earnings, refunds
// against, opt-in report counts — so one request gives a usable table. Role-aware
// like the rest of the console.

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "users");

    const url = new URL(req.url);
    const { page, perPage, from, to } = paging(url, 50);
    const q = ilikeSafe(url.searchParams.get("search") ?? "");
    const filter = url.searchParams.get("filter");

    let query = supabaseAdmin
      .from("v_users_admin")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (q) query = query.or(`username.ilike.%${q}%,display_name.ilike.%${q}%,pi_uid.ilike.%${q}%`);
    if (filter === "suspended") query = query.not("suspended_at", "is", null);
    if (filter === "providers") query = query.gt("active_listings", 0);

    const { data, error, count } = await query;
    if (error) {
      console.error("[admin:users] list failed:", error.message);
      return NextResponse.json({ error: "Users view unavailable. Run migration 011." }, { status: 500 });
    }

    return NextResponse.json({ users: data ?? [], count: Number(count ?? 0), page, perPage });
  } catch (err) {
    return adminError(err, "users");
  }
}
