import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError, paging, ilikeSafe } from "@/lib/admin-route";

// GET /api/admin/orders — the console's Orders table.
//
// One row per hire request from v_orders_admin, with participants, the listing,
// the full money breakdown and conversation volume. Supports status filter,
// free-text search, sorting and pagination, and returns the per-status counts
// the filter chips display so the client does not need a second request.

const SORTABLE = new Set(["created_at", "amount", "updated_at"]);

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "orders");

    const url = new URL(req.url);
    const { page, perPage, from, to } = paging(url, 25);
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search");
    const sort = url.searchParams.get("sort") ?? "created_at";
    const order = url.searchParams.get("order") === "asc" ? "asc" : "desc";

    let query = supabaseAdmin
      .from("v_orders_admin")
      .select("*", { count: "exact" })
      .order(SORTABLE.has(sort) ? sort : "created_at", { ascending: order === "asc" })
      .range(from, to);

    if (status && status !== "all") query = query.eq("status", status);
    if (search) {
      const s = ilikeSafe(search);
      if (s) {
        query = query.or(
          `id.ilike.%${s}%,service_title.ilike.%${s}%,buyer_name.ilike.%${s}%,provider_name.ilike.%${s}%,buyer_username.ilike.%${s}%,provider_username.ilike.%${s}%`,
        );
      }
    }

    const { data, error, count } = await query;
    if (error) {
      console.error("[admin:orders] list failed:", error.message);
      return NextResponse.json({ error: "Orders view unavailable. Run migration 011." }, { status: 500 });
    }

    // Status counts for the filter chips (cheap: heads only, unfiltered).
    const statuses = ["locked", "delivered", "released", "refunded", "disputed", "cancelled"];
    const counts = await Promise.all(
      statuses.map((st) =>
        supabaseAdmin
          .from("hire_requests")
          .select("id", { head: true, count: "exact" })
          .eq("status", st)
          .then((r) => [st, Number(r.count ?? 0)] as const),
      ),
    );
    const statusCounts = Object.fromEntries(counts);

    return NextResponse.json({ orders: data ?? [], count: Number(count ?? 0), page, perPage, statusCounts });
  } catch (err) {
    return adminError(err, "orders");
  }
}
