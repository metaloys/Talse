import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;

/**
 * GET /api/notifications?limit=30
 *
 * Returns the caller's own in-app notifications (newest first) plus an unread
 * count. Scoped to the verified Pi uid — a caller can never request another
 * user's inbox.
 */
export async function GET(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const url = new URL(req.url);
    const rawLimit = Number(url.searchParams.get("limit"));
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), MAX_LIMIT) : DEFAULT_LIMIT;

    const [{ data, error }, { count, error: countError }] = await Promise.all([
      supabaseAdmin
        .from("notifications")
        .select("id, title, body, subroute, kind, related_id, seen_at, created_at")
        .eq("user_uid", me.uid)
        .order("created_at", { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_uid", me.uid)
        .is("seen_at", null),
    ]);

    if (error) {
      console.error("[notifications] list failed:", error.message);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
    if (countError) {
      console.error("[notifications] unread count failed:", countError.message);
    }

    return NextResponse.json({ notifications: data ?? [], unread: count ?? 0 });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/notifications
 * Body: { ids?: string[]; all?: boolean }
 *
 * Marks the caller's notifications as seen. `all: true` marks every unread
 * notice; otherwise only the given ids (which are still scoped to the caller).
 */
export async function POST(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const body = await req.json().catch(() => ({}));
    const now = new Date().toISOString();

    let query = supabaseAdmin
      .from("notifications")
      .update({ seen_at: now })
      .eq("user_uid", me.uid)
      .is("seen_at", null);

    if (body?.all !== true) {
      const ids: string[] = Array.isArray(body?.ids)
        ? body.ids.filter((v: unknown): v is string => typeof v === "string" && v.length > 0)
        : [];
      if (ids.length === 0) {
        return NextResponse.json({ error: "Provide ids[] or all: true" }, { status: 400 });
      }
      query = query.in("id", ids);
    }

    const { error } = await query;
    if (error) {
      console.error("[notifications] mark-seen failed:", error.message);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}