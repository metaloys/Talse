import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabaseAdmin
    .from("services")
    .select("*, profiles!services_owner_uid_fkey(username, display_name, avatar_url, rating_avg, rating_count)")
    .eq("id", params.id)
    .single();

  if (error) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ service: data });
}

// PATCH — edit or toggle active. Only the owner may modify their listing.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const body = await req.json();

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("services")
      .select("owner_uid")
      .eq("id", params.id)
      .single();
    if (fetchErr || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.owner_uid !== me.uid) {
      return NextResponse.json({ error: "Forbidden: not the owner" }, { status: 403 });
    }

    const allowed = ["title", "category", "description", "price", "delivery_id", "images", "active"] as const;
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }

    const { data, error } = await supabaseAdmin
      .from("services")
      .update(patch)
      .eq("id", params.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ service: data });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// DELETE — owner-only.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("services")
      .select("owner_uid")
      .eq("id", params.id)
      .single();
    if (fetchErr || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.owner_uid !== me.uid) {
      return NextResponse.json({ error: "Forbidden: not the owner" }, { status: 403 });
    }

    const { error } = await supabaseAdmin.from("services").delete().eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
