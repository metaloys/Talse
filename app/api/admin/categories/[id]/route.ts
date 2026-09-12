import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { requireAdmin, NotAdminError } from "@/lib/admin";

// PATCH /api/admin/categories/:id - edit category (admin only)
export async function PATCH(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    requireAdmin(me.uid);
    const url = new URL(req.url);
    const id = url.pathname.split("/").pop();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const allowed: any = {};
    if (typeof body.label === "string") allowed.label = body.label;
    if (typeof body.short === "string") allowed.short = body.short;
    if (typeof body.blurb === "string") allowed.blurb = body.blurb;
    if (typeof body.hue === "number") allowed.hue = body.hue;
    if (typeof body.active === "boolean") allowed.active = body.active;
    if (typeof body.sort_order === "number") allowed.sort_order = body.sort_order;

    const { data, error } = await supabaseAdmin.from("categories").update(allowed).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ category: data });
  } catch (err) {
    if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
