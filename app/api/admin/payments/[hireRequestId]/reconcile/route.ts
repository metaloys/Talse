import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin, adminError } from "@/lib/admin-route";
import { reconcileStalePayoutLock } from "@/lib/dispute-resolution";

export async function POST(req: NextRequest, { params }: { params: Promise<{ hireRequestId: string }> }) {
  try {
    await authorizeAdmin(req, "escrow");
    const { hireRequestId } = await params;
    const body = await req.json().catch(() => ({}));
    const favor = body?.favor === "buyer" ? "buyer" : "provider";

    const outcome = await reconcileStalePayoutLock(hireRequestId, favor);

    if (outcome.action === "manual_review") {
      return NextResponse.json({ ok: false, action: "manual_review", error: outcome.error }, { status: 409 });
    }

    return NextResponse.json({ ok: true, action: outcome.action, request: outcome.request });
  } catch (err) {
    return adminError(err, "reconcile");
  }
}
