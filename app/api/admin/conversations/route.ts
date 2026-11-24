import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError } from "@/lib/admin-route";

// GET /api/admin/conversations — orders that have messages, newest first.
//
// Moderation and dispute work needs to read what buyers and providers actually
// said. Messages hang off hire requests, so the list is orders-with-volume and
// the drawer reads /api/admin/orders/[id] for the thread itself.

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "conversations");
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
    const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("perPage") ?? "25") || 25));
    const from = (page - 1) * perPage;

    const { data, error, count } = await supabaseAdmin
      .from("v_orders_admin")
      .select("id, service_title, buyer_name, provider_name, message_count, last_message_at, status", { count: "exact" })
      .gt("message_count", 0)
      .order("last_message_at", { ascending: false })
      .range(from, from + perPage - 1);

    if (error) {
      console.error("[admin:conversations] failed:", error.message);
      return NextResponse.json({ error: "Conversations unavailable. Run migration 011." }, { status: 500 });
    }
    return NextResponse.json({ conversations: data ?? [], count: Number(count ?? 0), page, perPage });
  } catch (err) {
    return adminError(err, "conversations");
  }
}
