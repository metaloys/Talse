import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { checkRateLimit } from "@/lib/rate-limit";

// POST /api/events - batched product analytics ingest (authenticated via Pi token).
//
// Analytics must never block or break a user action: invalid individual events
// are dropped rather than failing the whole batch, and DB failures return 200.
export async function POST(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    // 300 batches/hour is far above real usage but caps abuse.
    if (!(await checkRateLimit(`${me.uid}:events:ingest`, 300, 3600))) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again later." }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const incoming = Array.isArray(body?.events) ? body.events : null;
    if (!incoming) {
      return NextResponse.json({ error: "events must be an array" }, { status: 400 });
    }
    if (incoming.length > 20) {
      return NextResponse.json({ error: "At most 20 events per batch" }, { status: 400 });
    }

    const sessionId =
      typeof body?.sessionId === "string" && body.sessionId.length <= 64 ? body.sessionId : null;

    const rows: Array<{ pi_uid: string; name: string; props: Record<string, unknown>; session_id: string | null }> = [];
    for (const raw of incoming) {
      if (!raw || typeof raw !== "object") continue;
      const name = typeof raw.name === "string" ? raw.name.trim() : "";
      if (!/^[a-z][a-z0-9_]{1,63}$/.test(name)) continue;
      const props = raw.props && typeof raw.props === "object" && !Array.isArray(raw.props) ? raw.props : {};
      let serialized: string;
      try {
        serialized = JSON.stringify(props);
      } catch {
        continue;
      }
      if (serialized.length > 2048) continue;
      rows.push({ pi_uid: me.uid, name, props, session_id: sessionId });
    }

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, accepted: 0 });
    }

    const { error } = await supabaseAdmin.from("events").insert(rows);
    if (error) {
      // Never surface analytics failures to the user.
      console.error("[events] insert failed:", error.message);
      return NextResponse.json({ ok: true, accepted: 0 });
    }

    return NextResponse.json({ ok: true, accepted: rows.length }, { status: 202 });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[events] unexpected error:", err);
    return NextResponse.json({ ok: true, accepted: 0 });
  }
}
