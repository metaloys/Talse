import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError, writeAudit } from "@/lib/admin-route";
import { ADMIN_ROLES, isAdmin, type AdminRole } from "@/lib/admin";

// GET    /api/admin/admin-users          — admins and their roles
// POST   /api/admin/admin-users          — grant access { piUid, role, notes? }
// PATCH  /api/admin/admin-users          — change a role { piUid, role }
// DELETE /api/admin/admin-users?piUid=X  — revoke access
//
// Owner-only. ADMIN_PI_UIDS remains the bootstrap and those uids always resolve
// as owner; rows here are for additional admins. The last owner can never be
// demoted or removed, so the console can't lock everyone out.

type AdminRow = { pi_uid: string; role: string; granted_by: string | null; granted_at: string; last_seen_at: string | null; notes: string | null };

async function ownerCount(): Promise<number> {
  const { count } = await supabaseAdmin
    .from("admin_users")
    .select("pi_uid", { head: true, count: "exact" })
    .eq("role", "owner");
  return Number(count ?? 0);
}

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "admins");
    const { data, error } = await supabaseAdmin
      .from("admin_users")
      .select("*")
      .order("granted_at", { ascending: true });
    if (error) throw error;

    // Profiles make the list readable; env-only admins are marked as such.
    const uids = (data ?? []).map((r: AdminRow) => r.pi_uid);
    let names: Record<string, string> = {};
    if (uids.length > 0) {
      const { data: profiles } = await supabaseAdmin.from("profiles").select("pi_uid, username, display_name").in("pi_uid", uids);
      names = Object.fromEntries(
        (profiles ?? []).map((p: { pi_uid: string; username: string | null; display_name: string | null }) => [
          p.pi_uid,
          p.display_name?.trim() || p.username || p.pi_uid,
        ]),
      );
    }

    const admins = (data ?? []).map((r: AdminRow) => ({
      ...r,
      name: names[r.pi_uid] ?? r.pi_uid,
      env: isAdmin(r.pi_uid),
      /** Env-listed owners cannot be demoted/removed from the console. */
      locked: isAdmin(r.pi_uid),
    }));

    return NextResponse.json({ admins, roles: ADMIN_ROLES });
  } catch (err) {
    return adminError(err, "admin-users");
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await authorizeAdmin(req, "admins");
    const body = await req.json().catch(() => ({}));
    const piUid = typeof body.piUid === "string" ? body.piUid.trim() : "";
    const role = body.role as AdminRole;
    if (!piUid) return NextResponse.json({ error: "piUid is required" }, { status: 400 });
    if (!ADMIN_ROLES.includes(role)) return NextResponse.json({ error: "Unknown role" }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("admin_users")
      .upsert(
        { pi_uid: piUid, role, granted_by: access.uid, notes: typeof body.notes === "string" ? body.notes.slice(0, 500) : null },
        { onConflict: "pi_uid" },
      );
    if (error) throw error;

    await writeAudit({ adminUid: access.uid, action: "admin.grant", targetType: "admin", targetId: piUid, newState: { role } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return adminError(err, "admin-users");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const access = await authorizeAdmin(req, "admins");
    const body = await req.json().catch(() => ({}));
    const piUid = typeof body.piUid === "string" ? body.piUid.trim() : "";
    const role = body.role as AdminRole;
    if (!piUid) return NextResponse.json({ error: "piUid is required" }, { status: 400 });
    if (!ADMIN_ROLES.includes(role)) return NextResponse.json({ error: "Unknown role" }, { status: 400 });

    const { data: existing } = await supabaseAdmin.from("admin_users").select("role").eq("pi_uid", piUid).maybeSingle();
    if (!existing) return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    if (existing.role === "owner" && role !== "owner" && (await ownerCount()) <= 1) {
      return NextResponse.json({ error: "The last owner cannot be demoted." }, { status: 409 });
    }

    const { error } = await supabaseAdmin.from("admin_users").update({ role }).eq("pi_uid", piUid);
    if (error) throw error;

    await writeAudit({
      adminUid: access.uid,
      action: "admin.role",
      targetType: "admin",
      targetId: piUid,
      previousState: { role: existing.role },
      newState: { role },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return adminError(err, "admin-users");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const access = await authorizeAdmin(req, "admins");
    const piUid = new URL(req.url).searchParams.get("piUid")?.trim();
    if (!piUid) return NextResponse.json({ error: "piUid is required" }, { status: 400 });
    if (isAdmin(piUid)) {
      return NextResponse.json({ error: "This admin is set by ADMIN_PI_UIDS and cannot be removed here." }, { status: 409 });
    }

    const { data: existing } = await supabaseAdmin.from("admin_users").select("role").eq("pi_uid", piUid).maybeSingle();
    if (!existing) return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    if (existing.role === "owner" && (await ownerCount()) <= 1) {
      return NextResponse.json({ error: "The last owner cannot be removed." }, { status: 409 });
    }

    const { error } = await supabaseAdmin.from("admin_users").delete().eq("pi_uid", piUid);
    if (error) throw error;

    await writeAudit({ adminUid: access.uid, action: "admin.revoke", targetType: "admin", targetId: piUid, previousState: { role: existing.role } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return adminError(err, "admin-users");
  }
}
