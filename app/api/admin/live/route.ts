import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError } from "@/lib/admin-route";

// GET /api/admin/live — the Live Operations stream.
//
// A single chronological feed merged from the things an operator watches in
// real time: new orders, order status changes, reports, disputes and product
// events. The client polls this; it is intentionally one cheap query batch.

type FeedItem = {
  id: string;
  kind: "order" | "report" | "dispute" | "event";
  title: string;
  detail?: string;
  tone: "neutral" | "success" | "warning" | "danger";
  at: string;
  link?: { type: string; id: string };
};

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "live");

    const [ordersRes, reportsRes, eventsRes] = await Promise.all([
      supabaseAdmin
        .from("v_orders_admin")
        .select("id, status, amount, service_title, buyer_name, provider_name, updated_at")
        .order("updated_at", { ascending: false })
        .limit(25),
      supabaseAdmin
        .from("reports")
        .select("id, target_type, target_id, reason, status, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
      supabaseAdmin
        .from("events")
        .select("id, name, props, created_at")
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

    const items: FeedItem[] = [];

    for (const o of ordersRes.data ?? []) {
      const tone: FeedItem["tone"] =
        o.status === "released" ? "success" : o.status === "disputed" ? "danger" : o.status === "refunded" || o.status === "cancelled" ? "warning" : "neutral";
      items.push({
        id: `order:${o.id}`,
        kind: "order",
        title: `Order ${o.status} · ${o.amount} π`,
        detail: `${o.service_title ?? "listing"} — ${o.buyer_name ?? "buyer"} → ${o.provider_name ?? "provider"}`,
        tone,
        at: o.updated_at,
        link: { type: "order", id: o.id },
      });
    }

    for (const r of reportsRes.data ?? []) {
      items.push({
        id: `report:${r.id}`,
        kind: "report",
        title: `Report on ${r.target_type} · ${r.status}`,
        detail: r.reason ?? undefined,
        tone: r.status === "open" ? "warning" : "neutral",
        at: r.created_at,
        link: { type: r.target_type, id: r.target_id },
      });
    }

    for (const e of eventsRes.data ?? []) {
      const props = e.props ?? {};
      let detail: string | undefined;
      if (e.name === "service_view" && props.service_id) detail = `listing ${String(props.service_id).slice(0, 8)}`;
      else if (e.name === "boost_purchased") detail = `${props.amount ?? "?"} π boost`;
      items.push({
        id: `event:${e.id}`,
        kind: "event",
        title: e.name.replace(/_/g, " "),
        detail,
        tone: "neutral",
        at: e.created_at,
      });
    }

    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return NextResponse.json({ items: items.slice(0, 60), generatedAt: new Date().toISOString() });
  } catch (err) {
    return adminError(err, "live");
  }
}
