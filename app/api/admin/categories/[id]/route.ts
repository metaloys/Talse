import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError, writeAudit } from "@/lib/admin-route";

// PATCH /api/admin/categories/:id — edit a category (role-aware, audited).
export async function PATCH(req: NextRequest) {
  try {
    const access = await authorizeAdmin(req, "categories");

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

    const { data: before } = await supabaseAdmin.from("categories").select("*").eq("id", id).maybeSingle();
    const { data, error } = await supabaseAdmin.from("categories").update(allowed).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAudit({ adminUid: access.uid, action: "category.update", targetType: "category", targetId: id, previousState: before, newState: allowed });
    return NextResponse.json({ category: data });
  } catch (err) {
    return adminError(err, "category-update");
  }
}
