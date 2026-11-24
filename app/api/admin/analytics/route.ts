import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError } from "@/lib/admin-route";

// GET /api/admin/analytics?range=7|30|90|all
//
// Product analytics from the append-only `events` table (migration 007). The
// app has been collecting app_open / service_view / boost_purchased since launch
// with no way to read them; this exposes totals, a daily series, unique users,
// the acquisition→release funnel and the most-viewed listings.
//
// Aggregation happens in JS over the range's rows: volumes are small and this
// keeps the endpoint free of a custom SQL function.

const FUNNEL = [
  { step: "App open", event: "app_open" },
  { step: "Service viewed", event: "service_view" },
  { step: "Hire request", event: "hire_request_created" },
  { step: "Payment approved", event: "payment_approved" },
  { step: "Released", event: "job_released" },
];

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "analytics");

    const url = new URL(req.url);
    const range = url.searchParams.get("range") ?? "30";
    const since =
      range === "all" ? null : new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000).toISOString();

    let query = supabaseAdmin
      .from("events")
      .select("pi_uid, name, props, session_id, created_at")
      .order("created_at", { ascending: false })
      .limit(50000);
    if (since) query = query.gte("created_at", since);

    const { data, error } = await query;
    if (error) {
      console.error("[admin:analytics] events read failed:", error.message);
      return NextResponse.json({ error: "Events table unavailable. Run migration 007." }, { status: 500 });
    }

    const rows = data ?? [];
    const byName: Record<string, number> = {};
    const byDay: Record<string, number> = {};
    const usersAll = new Set<string>();
    const usersByDay: Record<string, Set<string>> = {};
    const sessions = new Set<string>();
    const serviceViews: Record<string, number> = {};

    for (const r of rows) {
      byName[r.name] = (byName[r.name] ?? 0) + 1;
      const day = String(r.created_at).slice(0, 10);
      byDay[day] = (byDay[day] ?? 0) + 1;
      if (r.pi_uid) {
        usersAll.add(r.pi_uid);
        (usersByDay[day] ??= new Set()).add(r.pi_uid);
      }
      if (r.session_id) sessions.add(r.session_id);
      if (r.name === "service_view" && r.props?.service_id) {
        const sid = String(r.props.service_id);
        serviceViews[sid] = (serviceViews[sid] ?? 0) + 1;
      }
    }

    // Resolve the most-viewed listings to titles so the table is readable.
    const topIds = Object.entries(serviceViews)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);
    let titles: Record<string, string> = {};
    if (topIds.length > 0) {
      const { data: svcs } = await supabaseAdmin.from("services").select("id, title").in("id", topIds);
      titles = Object.fromEntries((svcs ?? []).map((s: { id: string; title: string }) => [s.id, s.title]));
    }
    const topServices = topIds.map((id) => ({ id, title: titles[id] ?? "(unknown listing)", views: serviceViews[id] }));

    // Funnel: event counts, plus released jobs from ground truth when the
    // corresponding event is not emitted.
    const funnel = FUNNEL.map((f) => ({ ...f, count: byName[f.event] ?? 0 }));

    const days = Object.keys(byDay).sort();
    const series = days.map((day) => ({ day, events: byDay[day], users: usersByDay[day]?.size ?? 0 }));

    return NextResponse.json({
      range,
      totals: {
        events: rows.length,
        users: usersAll.size,
        sessions: sessions.size,
        dailyAverage: days.length ? Math.round(rows.length / days.length) : 0,
      },
      byName,
      series,
      funnel,
      topServices,
    });
  } catch (err) {
    return adminError(err, "analytics");
  }
}
