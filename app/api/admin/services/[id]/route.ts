import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError, writeAudit } from "@/lib/admin-route";

// PATCH /api/admin/services/[id] — activate/deactivate a listing. Role-aware and
// audited; the console's Listings screen drives it.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await authorizeAdmin(req, "listings");

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

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!current) return NextResponse.json({ error: "Service not found" }, { status: 404 });

    const previousActive = Boolean(current.active);
    const { error: updateErr } = await supabaseAdmin.from("services").update({ active: body.active }).eq("id", id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    const action = body.active ? "service.reactivate" : "service.deactivate";
    await writeAudit({
      adminUid: access.uid,
      action,
      targetType: "service",
      targetId: id,
      previousState: { active: previousActive },
      newState: { active: body.active },
      reason,
    });

    return NextResponse.json({ active: body.active, serviceId: id });
  } catch (err) {
    return adminError(err, "service-update");
  }
}
