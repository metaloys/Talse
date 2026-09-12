import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { requireAdmin, NotAdminError } from "@/lib/admin";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const me = await verifyPiToken(req.headers.get("authorization"));
    requireAdmin(me.uid);

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
    if (body.hidden && (!body.reason || typeof body.reason !== "string" || body.reason.trim().length === 0)) {
      return NextResponse.json({ error: "A reason is required when hiding a review." }, { status: 400 });
    }

    const { data: current, error: fetchErr } = await supabaseAdmin
      .from("reviews")
      .select("hidden_at, hidden_by, hidden_reason")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }
    if (!current) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    const previousHiddenAt = current.hidden_at ?? null;
    const nextHiddenAt = body.hidden ? new Date().toISOString() : null;
    const nextReason = body.hidden ? body.reason.trim() : null;
    const nextHiddenBy = body.hidden ? me.uid : null;

    const { error: updateErr } = await supabaseAdmin
      .from("reviews")
      .update({
        hidden_at: nextHiddenAt,
        hidden_by: nextHiddenBy,
        hidden_reason: nextReason,
      })
      .eq("id", id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    const action = body.hidden ? "review.hide" : "review.restore";
    const auditRow = {
      admin_uid: me.uid,
      action,
      target_type: "review",
      target_id: id,
      previous_state: { hidden_at: previousHiddenAt },
      new_state: { hidden_at: nextHiddenAt, hidden_by: nextHiddenBy, hidden_reason: nextReason },
      reason: body.reason ?? null,
    };

    let auditLogged = true;
    try {
      const { error: auditErr } = await supabaseAdmin.from("admin_audit_events").insert(auditRow as any);
      if (auditErr) {
        throw auditErr;
      }
    } catch (auditErr) {
      try {
        const { error: fallbackErr } = await supabaseAdmin.from("admin_audit_events").insert({
          admin_uid: me.uid,
          action,
          target_type: "review",
          target_id: id,
          details: {
            previous_state: { hidden_at: previousHiddenAt },
            new_state: { hidden_at: nextHiddenAt, hidden_by: nextHiddenBy, hidden_reason: nextReason },
            reason: body.reason ?? null,
          },
        } as any);
        if (fallbackErr) {
          throw fallbackErr;
        }
      } catch (fallbackErr) {
        auditLogged = false;
        console.error("Admin audit logging failed for review moderation", {
          id,
          adminUid: me.uid,
          action,
          previousHiddenAt,
          nextHiddenAt,
          nextHiddenBy,
          nextReason,
          reason: body.reason ?? null,
          error: fallbackErr instanceof Error ? fallbackErr.message : fallbackErr,
        });
      }
    }

    return NextResponse.json({
      reviewId: id,
      hidden: body.hidden,
      auditLogged,
      previousState: { hidden_at: previousHiddenAt },
      newState: { hidden_at: nextHiddenAt, hidden_by: nextHiddenBy, hidden_reason: nextReason },
    });
  } catch (err) {
    if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
