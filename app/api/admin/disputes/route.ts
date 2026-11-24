import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError } from "@/lib/admin-route";

// GET /api/admin/disputes — the console's Disputes screen.
//
// Shows every hire request that is currently disputed, or was disputed at some
// point (dispute_stage is not null covers the resolved-via-dispute history too,
// so "Resolved" rows are not lost once an admin acts). Now role-aware via the
// shared console gate, and flattened so the screen can render service_title
// without digging into the nested join.
export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "disputes");

    const { data, error } = await supabaseAdmin
      .from("hire_requests")
      .select(
        "*, services(title), buyer:profiles!hire_requests_buyer_uid_fkey(username, display_name), provider:profiles!hire_requests_provider_uid_fkey(username, display_name)"
      )
      .or("status.eq.disputed,dispute_stage.not.is.null")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[admin:disputes] failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const disputes = (data ?? []).map((row: Record<string, any>) => ({
      ...row,
      service_title: row.services?.title ?? null,
      buyer_name: row.buyer?.display_name ?? row.buyer?.username ?? null,
      provider_name: row.provider?.display_name ?? row.provider?.username ?? null,
    }));

    return NextResponse.json({ disputes });
  } catch (err) {
    return adminError(err, "disputes");
  }
}
