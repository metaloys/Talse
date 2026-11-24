import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { PiAuthError } from "@/lib/pi-verify";
import { NotAdminError } from "@/lib/admin";
import { authorizeAdmin, adminError, writeAudit } from "@/lib/admin-route";
import { payoutHireRequest, PayoutNotConfiguredError, PayoutWalletBusyError, PayoutWalletLeaseLostError } from "@/lib/dispute-resolution";

// POST /api/admin/disputes/[id]/resolve — { favorProvider: boolean, note? }
// The one place a dispute actually moves money: releases to the provider
// (dispute rejected / resolved in provider's favor) or refunds the buyer
// (resolved in buyer's favor). Records who resolved it, how, and why — the
// resolution now writes an admin audit row, since it is the single most
// consequential action in the console.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await authorizeAdmin(req, "escrow");

    const { favorProvider, note } = await req.json();
    if (typeof favorProvider !== "boolean") {
      return NextResponse.json({ error: "favorProvider (boolean) is required" }, { status: 400 });
    }

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("hire_requests")
      .select("status, amount, dispute_reason, dispute_filed_by")
      .eq("id", id)
      .single();
    if (fetchErr || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status !== "disputed") {
      return NextResponse.json({ error: `Cannot resolve from status '${existing.status}'` }, { status: 409 });
    }

    if (note !== undefined) {
      if (note !== null && typeof note !== "string") return NextResponse.json({ error: "Invalid admin note" }, { status: 400 });
      if (typeof note === "string" && note.trim().length > 1000) return NextResponse.json({ error: "Admin note must be at most 1000 characters." }, { status: 400 });
      await supabaseAdmin.from("hire_requests").update({ admin_note: note }).eq("id", id);
    }

    const data = await payoutHireRequest({
      hireRequestId: id,
      favor: favorProvider ? "provider" : "buyer",
      resolvedBy: access.uid,
    });

    await writeAudit({
      adminUid: access.uid,
      action: favorProvider ? "dispute.resolve_provider" : "dispute.resolve_buyer",
      targetType: "dispute",
      targetId: id,
      previousState: { status: "disputed", amount: existing.amount, dispute_reason: existing.dispute_reason },
      newState: { status: (data as { status?: string } | null)?.status ?? (favorProvider ? "released" : "refunded") },
      reason: typeof note === "string" ? note : null,
    });

    return NextResponse.json({ request: data });
  } catch (err) {
    if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PayoutNotConfiguredError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PayoutWalletBusyError || err instanceof PayoutWalletLeaseLostError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return adminError(err, "dispute-resolve");
  }
}
