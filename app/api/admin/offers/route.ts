import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError, paging, ilikeSafe } from "@/lib/admin-route";

// GET /api/admin/offers — counter-offer / negotiation ledger.
//
// hire_offers (migration 008) was invisible to admins even though it is where
// price negotiation happens. Read-only for now: the value is being able to see
// a negotiation when a dispute or an abuse report references it.

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "offers");

    const url = new URL(req.url);
    const { page, perPage, from, to } = paging(url, 25);
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search");

    let query = supabaseAdmin
      .from("v_offers_admin")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status && status !== "all") query = query.eq("status", status);
    if (search) {
      const s = ilikeSafe(search);
      if (s) query = query.or(`service_title.ilike.%${s}%,proposer_name.ilike.%${s}%,proposer_username.ilike.%${s}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      console.error("[admin:offers] list failed:", error.message);
      return NextResponse.json({ error: "Offers view unavailable. Run migrations 008 and 011." }, { status: 500 });
    }

    const statuses = ["pending", "accepted", "declined", "withdrawn"];
    const counts = await Promise.all(
      statuses.map((st) =>
        supabaseAdmin
          .from("hire_offers")
          .select("id", { head: true, count: "exact" })
          .eq("status", st)
          .then((r) => [st, Number(r.count ?? 0)] as const),
      ),
    );

    return NextResponse.json({ offers: data ?? [], count: Number(count ?? 0), page, perPage, statusCounts: Object.fromEntries(counts) });
  } catch (err) {
    return adminError(err, "offers");
  }
}
