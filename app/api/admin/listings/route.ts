import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError, paging, ilikeSafe } from "@/lib/admin-route";

// GET /api/admin/listings — the console's Listings table.
//
// Reads v_services_admin, which deliberately exposes cover_image but never the
// base64 `images` gallery (see migration 011 and the catalogue payload fix), so
// opening this screen can't re-introduce the 19 MB response problem.

const SORTABLE = new Set(["created_at", "price", "view_count", "order_count", "title"]);

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "listings");

    const url = new URL(req.url);
    const { page, perPage, from, to } = paging(url, 25);
    const search = url.searchParams.get("search");
    const active = url.searchParams.get("active");
    const sort = url.searchParams.get("sort") ?? "created_at";
    const order = url.searchParams.get("order") === "asc" ? "asc" : "desc";

    let query = supabaseAdmin
      .from("v_services_admin")
      .select("*", { count: "exact" })
      .order(SORTABLE.has(sort) ? sort : "created_at", { ascending: order === "asc" })
      .range(from, to);

    if (active === "true") query = query.eq("active", true);
    else if (active === "false") query = query.eq("active", false);
    else if (active === "boosted") query = query.gt("boosted_until", new Date().toISOString());
    if (search) {
      const s = ilikeSafe(search);
      if (s) query = query.or(`title.ilike.%${s}%,provider_name.ilike.%${s}%,provider_username.ilike.%${s}%,category_label.ilike.%${s}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      console.error("[admin:listings] failed:", error.message);
      return NextResponse.json({ error: "Listings view unavailable. Run migration 011." }, { status: 500 });
    }

    const boosted = (data ?? []).filter((r: { boosted_until?: string | null }) => r.boosted_until && new Date(r.boosted_until).getTime() > Date.now()).length;
    return NextResponse.json({ listings: data ?? [], count: Number(count ?? 0), page, perPage, boostedOnPage: boosted });
  } catch (err) {
    return adminError(err, "listings");
  }
}
