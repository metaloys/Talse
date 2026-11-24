import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { TITLE_MAX, DESC_MAX } from "@/lib/services/data";
import { assertNotSuspended, SuspendedError } from "@/lib/suspension";
import { sanitizeCoverImage } from "@/lib/service-images";

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

  // Catalogue rows deliberately omit services.images: that column holds
  // full-size base64 data URLs (~4 MB per listing), so selecting it made every
  // Home/search load weigh ~19 MB. Cards render cover_image instead; the
  // detail route (app/api/services/[id]) still returns the full gallery for
  // the single listing a user opens.
  const LIST_COLUMNS =
    "id, owner_uid, title, category, description, price, delivery_id, active, " +
    "boosted_until, created_at, updated_at, cover_image, " +
    "profiles!services_owner_uid_fkey(username, display_name, avatar_url, rating_avg, rating_count, jobs_completed, refunds_against_provider, total_earned)";

  let query = supabaseAdmin
    .from("services")
    .select(LIST_COLUMNS, { count: "exact" })
    .order("boosted_until", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  // owner param bypasses the active-only filter so a provider can see their
  // own inactive/draft listings on their profile screen. That means it
  // exposes non-public data — require a verified token and restrict it to
  // the caller's own uid (unauthenticated callers get the public browse path).
  if (owner) {
    try {
      const me = await verifyPiToken(req.headers.get("authorization"));
      if (owner !== me.uid) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } catch (err) {
      if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
    query = query.eq("owner_uid", owner);
  } else {
    query = query.eq("active", true);
  }
  if (category && category !== "all") {
    query = query.eq("category", category);
  }
  if (q) {
    // Strip characters with meaning in the PostgREST `or` grammar — without
    // this, a search term like "x,active.eq.false" appends arbitrary filters
    // (e.g. revealing deactivated listings) to the query.
    const safe = q.replace(/[,()"]/g, " ").trim();
    if (safe) {
      query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
    }
  }

  try {
    // Owner requests are returned unchanged (no pagination) to preserve
    // byte-identical response shape for owner screens — capped at 200 rows
    // as an exfiltration guard.
    if (owner) {
      const { data, error } = await query.range(0, 199);
      if (error) {
        console.error("[services] owner query failed:", error.message);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
      }
      return NextResponse.json({ services: data });
    }

    // Public browse path: apply pagination and request exact count.
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const { data, count, error } = await query.range(from, to);

    if (error) {
      console.error("[services] browse query failed:", error.message);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    const total = typeof count === "number" ? count : (Array.isArray(data) ? data.length : 0);
    const hasMore = from + (Array.isArray(data) ? data.length : 0) < total;

    return NextResponse.json({ services: data, page, perPage, total, hasMore });
  } catch (err) {
    console.error("[services] GET failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST /api/services — create a listing. Requires a verified Pi token;
// owner_uid is taken from the verified token, never from the request body.
export async function POST(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    await assertNotSuspended(me.uid);
    const body = await req.json();

    const { title, category, description, price, deliveryId, images, coverImage } = body;
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
        cover_image: sanitizeCoverImage(coverImage),
      })
      .select()
      .single();

    if (error) {
      console.error("[services] create failed:", error.message);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
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
