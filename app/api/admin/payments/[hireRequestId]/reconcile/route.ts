import { NextRequest, NextResponse } from "next/server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { requireAdmin, NotAdminError } from "@/lib/admin";
import { reconcileStalePayoutLock } from "@/lib/dispute-resolution";

export async function POST(req: NextRequest, { params }: { params: Promise<{ hireRequestId: string }> }) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    requireAdmin(me.uid);
    const { hireRequestId } = await params;
    const body = await req.json().catch(() => ({}));
    const favor = body?.favor === "buyer" ? "buyer" : "provider";

    const outcome = await reconcileStalePayoutLock(hireRequestId, favor);

    if (outcome.action === "manual_review") {
      return NextResponse.json({ ok: false, action: "manual_review", error: outcome.error }, { status: 409 });
    }

    return NextResponse.json({ ok: true, action: outcome.action, request: outcome.request });
  } catch (err) {
    if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
