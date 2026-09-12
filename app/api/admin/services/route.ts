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

    let query = supabaseAdmin
      .from("services")
      .select("id, title, category, price, active, boosted_until, profiles!services_owner_uid_fkey(username)")
      .order("created_at", { ascending: false });

    if (q) query = query.ilike("title", `%${q}%`);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const services = (data ?? []).map((row: any) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      price: row.price,
      active: row.active,
      boosted_until: row.boosted_until,
      owner_username: row.profiles?.username ?? null,
    }));

    return NextResponse.json({ services });
  } catch (err) {
    if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
