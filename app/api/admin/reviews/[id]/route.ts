import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError, writeAudit } from "@/lib/admin-route";

// PATCH /api/admin/reviews/[id] — hide or restore a review. Role-aware and
// audited; the console's Reviews screen drives it.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await authorizeAdmin(req, "reviews");

    const body = await req.json().catch(() => ({}));
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const allowedKeys = new Set(["hidden", "reason"]);
    const extraKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
    if (extraKeys.length > 0) {
      return NextResponse.json({ error: "Only hidden and reason are allowed in this route." }, { status: 400 });
    }
    if (typeof body.hidden !== "boolean") {
      return NextResponse.json({ error: "hidden is required and must be a boolean." }, { status: 400 });
    }
    if (body.reason !== undefined && typeof body.reason !== "string") {
      return NextResponse.json({ error: "reason must be a string when provided." }, { status: 400 });
    }
    if (body.hidden && (!body.reason || body.reason.trim().length === 0)) {
      return NextResponse.json({ error: "A reason is required when hiding a review." }, { status: 400 });
    }

    const { data: current, error: fetchErr } = await supabaseAdmin
      .from("reviews")
      .select("hidden_at, hidden_by, hidden_reason")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!current) return NextResponse.json({ error: "Review not found" }, { status: 404 });

    const nextHiddenAt = body.hidden ? new Date().toISOString() : null;
    const nextReason = body.hidden ? body.reason.trim() : null;
    const nextHiddenBy = body.hidden ? access.uid : null;

    const { error: updateErr } = await supabaseAdmin
      .from("reviews")
      .update({ hidden_at: nextHiddenAt, hidden_by: nextHiddenBy, hidden_reason: nextReason })
      .eq("id", id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    const action = body.hidden ? "review.hide" : "review.restore";
    await writeAudit({
      adminUid: access.uid,
      action,
      targetType: "review",
      targetId: id,
      previousState: { hidden_at: current.hidden_at ?? null },
      newState: { hidden_at: nextHiddenAt, hidden_by: nextHiddenBy, hidden_reason: nextReason },
      reason: typeof body.reason === "string" ? body.reason : null,
    });

    return NextResponse.json({ reviewId: id, hidden: body.hidden });
  } catch (err) {
    return adminError(err, "review-update");
  }
}
