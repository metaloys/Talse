import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";

// GET /api/reviews?provider=<uid>
export async function GET(req: NextRequest) {
  const provider = new URL(req.url).searchParams.get("provider");
  if (!provider) return NextResponse.json({ error: "Missing provider" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("reviews")
    .select("*")
    .eq("provider_uid", provider)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reviews: data });
}

// POST /api/reviews — buyer leaves a review; only allowed once, only after
// the hire request has reached 'released'.
export async function POST(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const { hireRequestId, rating, text } = await req.json();
    if (!hireRequestId || !rating) {
      return NextResponse.json({ error: "Missing hireRequestId or rating" }, { status: 400 });
    }
    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Rating must be 1-5" }, { status: 400 });
    }

    const { data: hr, error: fetchErr } = await supabaseAdmin
      .from("hire_requests")
      .select("id, buyer_uid, provider_uid, status")
      .eq("id", hireRequestId)
      .single();
    if (fetchErr || !hr) return NextResponse.json({ error: "Hire request not found" }, { status: 404 });
    if (hr.buyer_uid !== me.uid) return NextResponse.json({ error: "Only the buyer can review" }, { status: 403 });
    if (hr.status !== "released") {
      return NextResponse.json({ error: "Can only review after funds are released" }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("reviews")
      .insert({
        hire_request_id: hireRequestId,
        reviewer_uid: me.uid,
        provider_uid: hr.provider_uid,
        rating,
        text: text ?? null,
      })
      .select()
      .single();

    if (error) {
      // unique constraint on hire_request_id -> already reviewed
      if (error.code === "23505") return NextResponse.json({ error: "Already reviewed" }, { status: 409 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ review: data }, { status: 201 });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
