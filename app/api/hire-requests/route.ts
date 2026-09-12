import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertNotSuspended, SuspendedError } from "@/lib/suspension";

// GET /api/hire-requests?role=incoming|outgoing — scoped to the caller.
export async function GET(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role") ?? "outgoing";
    const pageParam = searchParams.get("page");
    const perPageParam = searchParams.get("perPage");

    const column = role === "incoming" ? "provider_uid" : "buyer_uid";

    // Parse and clamp pagination params
    let page = 1;
    let perPage = 20;
    if (pageParam) {
      const parsed = Number(pageParam);
      page = Number.isFinite(parsed) && parsed >= 1 ? Math.max(1, Math.floor(parsed)) : 1;
    }
    if (perPageParam) {
      const parsed = Number(perPageParam);
      perPage = Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 20;
    }
    perPage = Math.min(perPage, 50);

    let query = supabaseAdmin
      .from("hire_requests")
      .select(
        "*, services(title, images, price), buyer:profiles!hire_requests_buyer_uid_fkey(username, display_name), provider:profiles!hire_requests_provider_uid_fkey(username, display_name)",
        { count: "exact" }
      )
      .eq(column, me.uid)
      .order("created_at", { ascending: false });

    // Apply pagination
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const { data, count, error } = await query.range(from, to);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const total = typeof count === "number" ? count : (Array.isArray(data) ? data.length : 0);
    const hasMore = from + (Array.isArray(data) ? data.length : 0) < total;

    return NextResponse.json({ requests: data, page, perPage, total, hasMore });
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
    await assertNotSuspended(me.uid);
    // per-user rate limit for creating hire requests: 10 per hour
    if (!(await checkRateLimit(`${me.uid}:hire-requests:create`, 10, 3600))) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again later." }, { status: 429 });
    }
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
    try {
      await assertNotSuspended(service.owner_uid);
    } catch (err) {
      if (err instanceof SuspendedError) {
        return NextResponse.json({ error: "This provider is currently unavailable for new hires." }, { status: err.status });
      }
      throw err;
    }

    // Validate message length and deadline
    if (typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }
    const { MESSAGE_MAX } = await import("@/lib/services/data");
    if (message.trim().length > MESSAGE_MAX) {
      return NextResponse.json({ error: `Message must be at most ${MESSAGE_MAX} characters.` }, { status: 400 });
    }
    if (deadline !== undefined && deadline !== null && String(deadline).length > 0) {
      const ts = Date.parse(deadline);
      if (Number.isNaN(ts)) return NextResponse.json({ error: "Deadline must be a valid date" }, { status: 400 });
      if (ts < Date.now()) return NextResponse.json({ error: "Deadline cannot be in the past" }, { status: 400 });
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
    if (err instanceof SuspendedError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
