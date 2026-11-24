import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

// GET /api/providers/[id] — public provider card for a shared /providers/[id]
// link: the profile fields a visitor may see, plus that provider's active
// listings. Deliberately excludes services.images (base64 galleries) the same
// way the catalogue does; the detail route loads a gallery on demand.
const LIST_COLUMNS =
  "id, owner_uid, title, category, description, price, delivery_id, active, " +
  "boosted_until, created_at, updated_at, cover_image, " +
  "profiles!services_owner_uid_fkey(username, display_name, avatar_url, rating_avg, rating_count, jobs_completed, refunds_against_provider, total_earned)";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id.length > 120) return NextResponse.json({ error: "Invalid provider id" }, { status: 400 });

  const [profileRes, servicesRes] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select(
        "pi_uid, username, display_name, bio, location, created_at, rating_avg, rating_count, jobs_completed, refunds_against_provider, total_earned"
      )
      .eq("pi_uid", id)
      .maybeSingle(),
    supabaseAdmin
      .from("services")
      .select(LIST_COLUMNS)
      .eq("owner_uid", id)
      .eq("active", true)
      .order("boosted_until", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (profileRes.error && profileRes.error.code !== "PGRST116") {
    console.error("[providers] profile failed:", profileRes.error.message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
  if (servicesRes.error) {
    console.error("[providers] listings failed:", servicesRes.error.message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  const p = profileRes.data;
  if (!p && (servicesRes.data ?? []).length === 0) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  return NextResponse.json({
    provider: p
      ? {
          id: p.pi_uid,
          name: p.display_name || p.username || "Provider",
          bio: p.bio ?? "",
          location: p.location ?? "",
          joinedAt: p.created_at ? new Date(p.created_at).getTime() : 0,
          ratingAvg: Number(p.rating_avg ?? 0),
          ratingCount: Number(p.rating_count ?? 0),
          jobsCompleted: Number(p.jobs_completed ?? 0),
          refundsAgainstProvider: Number(p.refunds_against_provider ?? 0),
          totalEarned: Number(p.total_earned ?? 0),
        }
      : null,
    services: servicesRes.data ?? [],
  });
}