import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { requireAdmin, NotAdminError } from "@/lib/admin";
import { payoutHireRequest, PayoutNotConfiguredError } from "@/lib/dispute-resolution";

// POST /api/admin/disputes/[id]/resolve — { favorProvider: boolean, note? }
// The one place a dispute actually moves money: releases to the provider
// (dispute rejected / resolved in provider's favor) or refunds the buyer
// (resolved in buyer's favor). Records who resolved it and how.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    requireAdmin(me.uid);

    const { favorProvider, note } = await req.json();
    if (typeof favorProvider !== "boolean") {
      return NextResponse.json({ error: "favorProvider (boolean) is required" }, { status: 400 });
    }

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("hire_requests")
      .select("status")
      .eq("id", params.id)
      .single();
    if (fetchErr || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status !== "disputed") {
      return NextResponse.json({ error: `Cannot resolve from status '${existing.status}'` }, { status: 409 });
    }

    if (note !== undefined) {
      await supabaseAdmin.from("hire_requests").update({ admin_note: note }).eq("id", params.id);
    }

    const data = await payoutHireRequest({
      hireRequestId: params.id,
      favor: favorProvider ? "provider" : "buyer",
      resolvedBy: me.uid,
    });

    return NextResponse.json({ request: data });
  } catch (err) {
    if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PayoutNotConfiguredError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
