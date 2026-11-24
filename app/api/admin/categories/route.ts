import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { requireAdmin, NotAdminError } from "@/lib/admin";
import { writeAudit } from "@/lib/admin-route";

// GET (admin): list categories (including inactive), POST (admin): create
export async function GET(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    requireAdmin(me.uid);
    const { data, error } = await supabaseAdmin.from("categories").select("*").order("sort_order", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Listing counts per category so the console can show which are in use.
    const { data: services } = await supabaseAdmin.from("services").select("category");
    const counts: Record<string, number> = {};
    for (const s of services ?? []) {
      if (s.category) counts[s.category] = (counts[s.category] ?? 0) + 1;
    }
    const categories = (data ?? []).map((c: { id: string }) => ({ ...c, listing_count: counts[c.id] ?? 0 }));

    return NextResponse.json({ categories });
  } catch (err) {
    if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    requireAdmin(me.uid);
    const body = await req.json().catch(() => ({}));
    const { id, label, short, blurb, hue, active, sort_order } = body ?? {};
    if (!id || !label || !short || !blurb || typeof hue !== "number") return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    const payload = { id, label, short, blurb, hue, active: active ?? true, sort_order: sort_order ?? 0 };
    const { data, error } = await supabaseAdmin.from("categories").insert(payload).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await writeAudit({ adminUid: me.uid, action: "category.create", targetType: "category", targetId: id, newState: payload });
    return NextResponse.json({ category: data }, { status: 201 });
  } catch (err) {
    if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
