import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";

// GET /api/services?category=design&q=logo&owner=<uid>
// Public read — powers Home / Categories / Search screens.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const q = searchParams.get("q");
  const owner = searchParams.get("owner");

  let query = supabaseAdmin
    .from("services")
    .select("*, profiles!services_owner_uid_fkey(username, display_name, avatar_url, rating_avg, rating_count)")
    .order("boosted_until", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  // owner param bypasses the active-only filter so a provider can see their
  // own inactive/draft listings on their profile screen.
  if (owner) {
    query = query.eq("owner_uid", owner);
  } else {
    query = query.eq("active", true);
  }
  if (category && category !== "all") {
    query = query.eq("category", category);
  }
  if (q) {
    query = query.ilike("title", `%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ services: data });
}

// POST /api/services — create a listing. Requires a verified Pi token;
// owner_uid is taken from the verified token, never from the request body.
export async function POST(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const body = await req.json();

    const { title, category, description, price, deliveryId, images } = body;
    if (!title || !category || !description || price == null || !deliveryId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Ensure a profile row exists (upsert on first write from a new user)
    await supabaseAdmin
      .from("profiles")
      .upsert({ pi_uid: me.uid, username: me.username }, { onConflict: "pi_uid", ignoreDuplicates: true });

    const { data, error } = await supabaseAdmin
      .from("services")
      .insert({
        owner_uid: me.uid,
        title,
        category,
        description,
        price,
        delivery_id: deliveryId,
        images: images ?? [],
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ service: data }, { status: 201 });
  } catch (err) {
    if (err instanceof PiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
