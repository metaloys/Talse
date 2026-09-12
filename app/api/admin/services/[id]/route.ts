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

    const allowedKeys = new Set(["active", "reason"]);
    const extraKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
    if (extraKeys.length > 0) {
      return NextResponse.json({ error: "Only active and reason are allowed in this route." }, { status: 400 });
    }

    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "active is required and must be a boolean." }, { status: 400 });
    }
    if (body.reason !== undefined && typeof body.reason !== "string") {
      return NextResponse.json({ error: "reason must be a string when provided." }, { status: 400 });
    }

    const reason = body.reason ?? null;
    const { data: current, error: fetchErr } = await supabaseAdmin
      .from("services")
      .select("active")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }
    if (!current) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    const previousActive = Boolean(current.active);
    const { error: updateErr } = await supabaseAdmin.from("services").update({ active: body.active }).eq("id", id);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    const action = body.active ? "service.reactivate" : "service.deactivate";
    const auditRow = {
      admin_uid: me.uid,
      action,
      target_type: "service",
      target_id: id,
      previous_state: { active: previousActive },
      new_state: { active: body.active },
      reason,
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
          target_type: "service",
          target_id: id,
          details: {
            previous_state: { active: previousActive },
            new_state: { active: body.active },
            reason,
          },
        } as any);
        if (fallbackErr) {
          throw fallbackErr;
        }
      } catch (fallbackErr) {
        auditLogged = false;
        console.error("Admin audit logging failed for service toggle", {
          id,
          adminUid: me.uid,
          action,
          previousActive,
          nextActive: body.active,
          reason,
          error: fallbackErr instanceof Error ? fallbackErr.message : fallbackErr,
        });
      }
    }

    return NextResponse.json({
      active: body.active,
      auditLogged,
      serviceId: id,
      previousState: { active: previousActive },
      newState: { active: body.active },
    });
  } catch (err) {
    if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
