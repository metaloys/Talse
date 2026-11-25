import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";

/**
 * GET /api/messages/unread
 *
 * Returns how many unread messages the caller has, in total and per hire
 * request. Unread means "from the other participant and newer than the last
 * time the caller opened that thread" (see `conversation_reads`).
 *
 * Scoped to the caller: only requests where they are the buyer or provider are
 * considered.
 */
export async function GET(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));

    // Two explicit lookups rather than an `.or(...)` string, so a uid can never
    // change the query shape.
    const [{ data: asBuyer, error: buyerErr }, { data: asProvider, error: providerErr }] = await Promise.all([
      supabaseAdmin.from("hire_requests").select("id").eq("buyer_uid", me.uid),
      supabaseAdmin.from("hire_requests").select("id").eq("provider_uid", me.uid),
    ]);
    if (buyerErr || providerErr) {
      console.error("[messages] unread: request lookup failed:", buyerErr?.message ?? providerErr?.message);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    const ids = Array.from(new Set([...(asBuyer ?? []), ...(asProvider ?? [])].map((r) => r.id)));
    if (ids.length === 0) return NextResponse.json({ total: 0, byRequest: {} });

    const { data: reads, error: readErr } = await supabaseAdmin
      .from("conversation_reads")
      .select("hire_request_id, last_read_at")
      .eq("user_uid", me.uid)
      .in("hire_request_id", ids);
    if (readErr) {
      // Missing read state should mean "everything is unread", not a 500.
      console.error("[messages] unread: read-state lookup failed:", readErr.message);
    }
    const seenAt = new Map<string, number>();
    for (const r of reads ?? []) {
      const t = new Date(r.last_read_at).getTime();
      if (Number.isFinite(t)) seenAt.set(r.hire_request_id, t);
    }

    const { data: msgs, error: msgErr } = await supabaseAdmin
      .from("messages")
      .select("hire_request_id, created_at")
      .in("hire_request_id", ids)
      .neq("sender_uid", me.uid)
      .limit(5000);
    if (msgErr) {
      console.error("[messages] unread: message lookup failed:", msgErr.message);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    const byRequest: Record<string, number> = {};
    let total = 0;
    for (const m of msgs ?? []) {
      const created = new Date(m.created_at).getTime();
      const seen = seenAt.get(m.hire_request_id) ?? 0;
      if (Number.isFinite(created) && created > seen) {
        byRequest[m.hire_request_id] = (byRequest[m.hire_request_id] ?? 0) + 1;
        total += 1;
      }
    }

    return NextResponse.json({ total, byRequest });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}