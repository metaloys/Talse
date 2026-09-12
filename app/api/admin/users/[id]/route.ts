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

    const allowedKeys = new Set(["suspended", "reason"]);
    const extraKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
    if (extraKeys.length > 0) {
      return NextResponse.json({ error: "Only suspended and reason are allowed in this route." }, { status: 400 });
    }

    if (typeof body.suspended !== "boolean") {
      return NextResponse.json({ error: "suspended is required and must be a boolean." }, { status: 400 });
    }
    if (body.reason !== undefined && typeof body.reason !== "string") {
      return NextResponse.json({ error: "reason must be a string when provided." }, { status: 400 });
    }

    if (body.suspended && (!body.reason || typeof body.reason !== "string" || body.reason.trim().length === 0)) {
      return NextResponse.json({ error: "A suspension reason is required when suspending an account." }, { status: 400 });
    }

    const { data: current, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("suspended_at, suspension_reason")
      .eq("pi_uid", id)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }
    if (!current) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const previousSuspendedAt = current.suspended_at ?? null;
    const nextSuspendedAt = body.suspended ? new Date().toISOString() : null;
    const nextReason = body.suspended ? body.reason.trim() : null;

    const { error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update({
        suspended_at: nextSuspendedAt,
        suspension_reason: nextReason,
      })
      .eq("pi_uid", id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    const action = body.suspended ? "user.suspend" : "user.unsuspend";
    const auditRow = {
      admin_uid: me.uid,
      action,
      target_type: "user",
      target_id: id,
      previous_state: { suspended_at: previousSuspendedAt },
      new_state: { suspended_at: nextSuspendedAt, suspension_reason: nextReason },
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
          target_type: "user",
          target_id: id,
          details: {
            previous_state: { suspended_at: previousSuspendedAt },
            new_state: { suspended_at: nextSuspendedAt, suspension_reason: nextReason },
            reason: body.reason ?? null,
          },
        } as any);
        if (fallbackErr) {
          throw fallbackErr;
        }
      } catch (fallbackErr) {
        auditLogged = false;
        console.error("Admin audit logging failed for user suspension change", {
          id,
          adminUid: me.uid,
          action,
          previousSuspendedAt,
          nextSuspendedAt,
          nextReason,
          reason: body.reason ?? null,
          error: fallbackErr instanceof Error ? fallbackErr.message : fallbackErr,
        });
      }
    }

    return NextResponse.json({
      userId: id,
      suspended: body.suspended,
      auditLogged,
      previousState: { suspended_at: previousSuspendedAt },
      newState: { suspended_at: nextSuspendedAt, suspension_reason: nextReason },
    });
  } catch (err) {
    if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
