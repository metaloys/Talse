import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { payoutHireRequest } from "@/lib/dispute-resolution";

/**
 * Self-service refund path — provider voluntarily refunds, or either party
 * on a request that's still 'locked'/'delivered'. For a *disputed* request,
 * prefer /api/admin/disputes/[id]/resolve instead, which requires an admin
 * and records who resolved it and in whose favor.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));

    const { data: hr, error: fetchErr } = await supabaseAdmin
      .from("hire_requests")
      .select("id, buyer_uid, provider_uid, status")
      .eq("id", params.id)
      .single();
    if (fetchErr || !hr) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (hr.buyer_uid !== me.uid && hr.provider_uid !== me.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!["locked", "delivered"].includes(hr.status)) {
      return NextResponse.json(
        { error: `Cannot self-service refund from status '${hr.status}' — use dispute resolution instead` },
        { status: 409 }
      );
    }

    const data = await payoutHireRequest({ hireRequestId: params.id, favor: "buyer" });
    return NextResponse.json({ request: data });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
