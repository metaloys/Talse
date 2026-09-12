import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { TITLE_MAX, DESC_MAX } from "@/lib/services/data";
import { assertNotSuspended, SuspendedError } from "@/lib/suspension";

// GET /api/services?category=design&q=logo&owner=<uid>
// Public read — powers Home / Categories / Search screens.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const q = searchParams.get("q");
  const owner = searchParams.get("owner");
  const pageParam = searchParams.get("page");
  const perPageParam = searchParams.get("perPage");

  // Parse and clamp pagination params (server-side guardrails)
  let page = 1;
  let perPage = 20;
  if (pageParam) {
    const parsed = Number(pageParam);
    page = Number.isFinite(parsed) && parsed >= 1 ? Math.max(1, Math.floor(parsed)) : 1;
  }
  if (perPageParam) {
    const parsed = Number(perPageParam);
    perPage = Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 20;
  }
  // hard cap
  perPage = Math.min(perPage, 50);

  let query = supabaseAdmin
    .from("services")
    .select(
      "*, profiles!services_owner_uid_fkey(username, display_name, avatar_url, rating_avg, rating_count, jobs_completed, refunds_against_provider, total_earned)",
      { count: "exact" }
    )
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
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
  }

  try {
    // Owner requests are returned unchanged (no pagination) to preserve
    // byte-identical response shape for owner screens.
    if (owner) {
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ services: data });
    }

    // Public browse path: apply pagination and request exact count.
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const { data, count, error } = await query.range(from, to);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const total = typeof count === "number" ? count : (Array.isArray(data) ? data.length : 0);
    const hasMore = from + (Array.isArray(data) ? data.length : 0) < total;

    return NextResponse.json({ services: data, page, perPage, total, hasMore });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? "Internal error" }, { status: 500 });
  }
}

// POST /api/services — create a listing. Requires a verified Pi token;
// owner_uid is taken from the verified token, never from the request body.
export async function POST(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    await assertNotSuspended(me.uid);
    const body = await req.json();

    const { title, category, description, price, deliveryId, images } = body;
    if (!title || !category || !description || price == null || !deliveryId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (typeof title !== "string" || title.trim().length === 0 || title.trim().length > TITLE_MAX) {
      return NextResponse.json({ error: `Title must be non-empty and at most ${TITLE_MAX} characters.` }, { status: 400 });
    }
    if (typeof description !== "string" || description.trim().length === 0 || description.trim().length > DESC_MAX) {
      return NextResponse.json({ error: `Description must be non-empty and at most ${DESC_MAX} characters.` }, { status: 400 });
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 1) {
      return NextResponse.json({ error: "Minimum listing price is 1 Pi." }, { status: 400 });
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
        price: priceNum,
        delivery_id: deliveryId,
        images: images ?? [],
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ service: data }, { status: 201 });
  } catch (err) {
    if (err instanceof SuspendedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof PiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
