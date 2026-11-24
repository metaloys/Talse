import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError } from "@/lib/admin-route";

// GET /api/admin/orders/[id] — everything an operator needs to investigate one
// order without leaving the drawer: the order row, the conversation (messages
// with sender names), the negotiation history, and the audit trail for the
// order. Replaces the old `JSON.stringify(row)` detail view.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorizeAdmin(req, "orders");
    const { id } = await params;

    const [orderRes, messagesRes, offersRes, auditRes] = await Promise.all([
      supabaseAdmin.from("v_orders_admin").select("*").eq("id", id).maybeSingle(),
      supabaseAdmin
        .from("v_messages_with_sender")
        .select("*")
        .eq("hire_request_id", id)
        .order("created_at", { ascending: true })
        .limit(500),
      supabaseAdmin
        .from("v_offers_admin")
        .select("*")
        .eq("hire_request_id", id)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("admin_audit_events")
        .select("id, admin_uid, action, previous_state, new_state, reason, created_at")
        .eq("target_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (orderRes.error || !orderRes.data) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({
      order: orderRes.data,
      messages: messagesRes.data ?? [],
      offers: offersRes.data ?? [],
      audit: auditRes.data ?? [],
    });
  } catch (err) {
    return adminError(err, "orders");
  }
}
