import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError, paging, ilikeSafe } from "@/lib/admin-route";

// GET /api/admin/boosts — the featured-listing ledger.
//
// Every boost purchase with its listing, buyer, amount, network cost, Pi
// payment id, txid and the resulting boosted_until window. Previously these
// rows were only visible as a single number on the dashboard.

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "boosts");

    const url = new URL(req.url);
    const { page, perPage, from, to } = paging(url, 25);
    const search = url.searchParams.get("search");
    const activeOnly = url.searchParams.get("active") === "true";

    let query = supabaseAdmin
      .from("v_boosts_admin")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (activeOnly) query = query.gt("boosted_until", new Date().toISOString());
    if (search) {
      const s = ilikeSafe(search);
      if (s) query = query.or(`service_title.ilike.%${s}%,buyer_name.ilike.%${s}%,buyer_username.ilike.%${s}%,payment_id.ilike.%${s}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      console.error("[admin:boosts] list failed:", error.message);
      return NextResponse.json({ error: "Boosts view unavailable. Run migration 011." }, { status: 500 });
    }
    return NextResponse.json({ boosts: data ?? [], count: Number(count ?? 0), page, perPage });
  } catch (err) {
    return adminError(err, "boosts");
  }
}
