import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { TITLE_MAX, DESC_MAX } from "@/lib/services/data";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("services")
    .select(
      "*, profiles!services_owner_uid_fkey(username, display_name, avatar_url, rating_avg, rating_count, jobs_completed, refunds_against_provider, total_earned)"
    )
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ service: data });
}

// PATCH — edit or toggle active. Only the owner may modify their listing.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const body = await req.json();

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("services")
      .select("owner_uid")
      .eq("id", id)
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

    if ("title" in patch) {
      const t = patch.title;
      if (typeof t !== "string" || t.trim().length === 0 || t.trim().length > TITLE_MAX) {
        return NextResponse.json({ error: `Title must be non-empty and at most ${TITLE_MAX} characters.` }, { status: 400 });
      }
    }
    if ("description" in patch) {
      const d = patch.description;
      if (typeof d !== "string" || d.trim().length === 0 || d.trim().length > DESC_MAX) {
        return NextResponse.json({ error: `Description must be non-empty and at most ${DESC_MAX} characters.` }, { status: 400 });
      }
    }
    if ("price" in patch) {
      const p = Number(patch.price as any);
      if (!Number.isFinite(p) || p < 1) return NextResponse.json({ error: "Minimum listing price is 1 Pi." }, { status: 400 });
      patch.price = p;
    }

    const { data, error } = await supabaseAdmin
      .from("services")
      .update(patch)
      .eq("id", id)
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
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("services")
      .select("owner_uid")
      .eq("id", id)
      .single();
    if (fetchErr || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.owner_uid !== me.uid) {
      return NextResponse.json({ error: "Forbidden: not the owner" }, { status: 403 });
    }

    const { error } = await supabaseAdmin.from("services").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
