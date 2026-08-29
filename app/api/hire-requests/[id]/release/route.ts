import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { payoutHireRequest, PayoutNotConfiguredError } from "@/lib/dispute-resolution";

/**
 * Buyer confirms delivery -> release escrowed funds to the provider.
 *
 * CONTRACT SEAM: see lib/dispute-resolution.ts — payoutHireRequest() is
 * the single place the custodial A2U call happens, shared with the admin
 * dispute-resolution path. Swap it there once native escrow is available.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));

    const { data: hr, error: fetchErr } = await supabaseAdmin
      .from("hire_requests")
      .select("id, buyer_uid, status")
      .eq("id", params.id)
      .single();
    if (fetchErr || !hr) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (hr.buyer_uid !== me.uid) return NextResponse.json({ error: "Only the buyer can release funds" }, { status: 403 });
    if (hr.status !== "delivered") {
      return NextResponse.json({ error: `Cannot release from status '${hr.status}'` }, { status: 409 });
    }

    const data = await payoutHireRequest({ hireRequestId: params.id, favor: "provider" });
    return NextResponse.json({ request: data });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PayoutNotConfiguredError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
