import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError, writeAudit } from "@/lib/admin-route";

// GET /api/admin/users/[id] — full user drill-down for the console.
// Profile + aggregated counters come from v_users_admin; the activity lists are
// the same shapes the Orders/Listings/Reviews screens use, so the drawer can
// reuse their rendering. Replaces the old raw-JSON detail view.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await authorizeAdmin(req, "users");

    const [profileRes, listingsRes, asBuyerRes, asProviderRes, reviewsRes, reportsFiledRes, reportsAgainstRes, auditRes] =
      await Promise.all([
        supabaseAdmin.from("v_users_admin").select("*").eq("pi_uid", id).maybeSingle(),
        supabaseAdmin.from("v_services_admin").select("*").eq("owner_uid", id).order("created_at", { ascending: false }),
        supabaseAdmin.from("v_orders_admin").select("*").eq("buyer_uid", id).order("created_at", { ascending: false }).limit(50),
        supabaseAdmin.from("v_orders_admin").select("*").eq("provider_uid", id).order("created_at", { ascending: false }).limit(50),
        supabaseAdmin.from("reviews").select("*").eq("provider_uid", id).order("created_at", { ascending: false }).limit(50),
        supabaseAdmin.from("reports").select("*").eq("reporter_uid", id).order("created_at", { ascending: false }).limit(50),
        supabaseAdmin.from("reports").select("*").eq("target_type", "user").eq("target_id", id).order("created_at", { ascending: false }).limit(50),
        supabaseAdmin
          .from("admin_audit_events")
          .select("id, admin_uid, action, reason, created_at")
          .eq("target_type", "user")
          .eq("target_id", id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

    if (!profileRes.data) return NextResponse.json({ error: "User not found" }, { status: 404 });

    return NextResponse.json({
      profile: profileRes.data,
      listings: listingsRes.data ?? [],
      ordersAsBuyer: asBuyerRes.data ?? [],
      ordersAsProvider: asProviderRes.data ?? [],
      reviews: reviewsRes.data ?? [],
      reportsFiled: reportsFiledRes.data ?? [],
      reportsAgainst: reportsAgainstRes.data ?? [],
      audit: auditRes.data ?? [],
    });
  } catch (err) {
    return adminError(err, "users:detail");
  }
}

// PATCH /api/admin/users/[id] — suspend or restore an account. Moderation, so
// it requires the "trust" section (owner/ops) and is always audited.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await authorizeAdmin(req, "trust");

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
    if (body.suspended && (!body.reason || body.reason.trim().length === 0)) {
      return NextResponse.json({ error: "A suspension reason is required when suspending an account." }, { status: 400 });
    }

    const { data: current, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("suspended_at, suspension_reason")
      .eq("pi_uid", id)
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!current) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const previousSuspendedAt = current.suspended_at ?? null;
    const nextSuspendedAt = body.suspended ? new Date().toISOString() : null;
    const nextReason = body.suspended ? body.reason.trim() : null;

    const { error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update({ suspended_at: nextSuspendedAt, suspension_reason: nextReason })
      .eq("pi_uid", id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    const action = body.suspended ? "user.suspend" : "user.unsuspend";
    await writeAudit({
      adminUid: access.uid,
      action,
      targetType: "user",
      targetId: id,
      previousState: { suspended_at: previousSuspendedAt },
      newState: { suspended_at: nextSuspendedAt, suspension_reason: nextReason },
      reason: typeof body.reason === "string" ? body.reason : null,
    });

    return NextResponse.json({
      userId: id,
      suspended: body.suspended,
      previousState: { suspended_at: previousSuspendedAt },
      newState: { suspended_at: nextSuspendedAt, suspension_reason: nextReason },
    });
  } catch (err) {
    return adminError(err, "users:patch");
  }
}
