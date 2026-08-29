import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";

// GET /api/hire-requests?role=incoming|outgoing — scoped to the caller.
export async function GET(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role") ?? "outgoing";

    const column = role === "incoming" ? "provider_uid" : "buyer_uid";
    const { data, error } = await supabaseAdmin
      .from("hire_requests")
      .select(
        "*, services(title, images, price), buyer:profiles!hire_requests_buyer_uid_fkey(username, display_name), provider:profiles!hire_requests_provider_uid_fkey(username, display_name)"
      )
      .eq(column, me.uid)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ requests: data });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST /api/hire-requests — buyer submits a hire request (status: pending).
// No money moves yet — this just records intent, matching the current
// hire-form.tsx behavior. Payment/escrow lock happens in a separate step
// once the provider accepts (see /api/hire-requests/[id]/lock).
export async function POST(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const body = await req.json();
    const { serviceId, message, deadline, attachments } = body;

    if (!serviceId || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data: service, error: svcErr } = await supabaseAdmin
      .from("services")
      .select("id, owner_uid, price, active")
      .eq("id", serviceId)
      .single();
    if (svcErr || !service) return NextResponse.json({ error: "Service not found" }, { status: 404 });
    if (!service.active) return NextResponse.json({ error: "Service is not active" }, { status: 400 });
    if (service.owner_uid === me.uid) {
      return NextResponse.json({ error: "Cannot hire your own service" }, { status: 400 });
    }

    await supabaseAdmin
      .from("profiles")
      .upsert({ pi_uid: me.uid, username: me.username }, { onConflict: "pi_uid", ignoreDuplicates: true });

    const { data, error } = await supabaseAdmin
      .from("hire_requests")
      .insert({
        service_id: service.id,
        buyer_uid: me.uid,
        provider_uid: service.owner_uid,
        message,
        deadline: deadline || null,
        attachments: attachments ?? [],
        amount: service.price,
        status: "pending",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ request: data }, { status: 201 });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
