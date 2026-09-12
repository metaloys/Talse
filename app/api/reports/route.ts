import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { checkRateLimit } from "@/lib/rate-limit";

// POST /api/reports - create a user report (authenticated via Pi token)
export async function POST(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    // per-user rate limit for filing reports: 20 per day
    if (!(await checkRateLimit(`${me.uid}:reports:create`, 20, 24 * 3600))) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again later." }, { status: 429 });
    }
    const body = await req.json().catch(() => ({}));

    const allowedTypes = new Set(["service", "user", "review"]);
    const { target_type, target_id, reason, details } = body ?? {};

    if (!target_type || !allowedTypes.has(target_type)) {
      return NextResponse.json({ error: "Invalid target_type" }, { status: 400 });
    }
    if (!target_id || typeof target_id !== "string") {
      return NextResponse.json({ error: "Invalid target_id" }, { status: 400 });
    }
    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return NextResponse.json({ error: "Reason is required" }, { status: 400 });
    }

    const payload: any = {
      reporter_uid: me.uid,
      target_type,
      target_id,
      reason: reason.trim(),
      details: typeof details === "string" ? details.trim() : null,
    };

    // validate reason/details lengths
    if (typeof reason !== "string" || reason.trim().length === 0) {
      return NextResponse.json({ error: "Reason is required" }, { status: 400 });
    }
    if (reason.trim().length > 200) return NextResponse.json({ error: "Reason must be at most 200 characters." }, { status: 400 });
    if (details !== undefined && details !== null && String(details).trim().length > 2000)
      return NextResponse.json({ error: "Details must be at most 2000 characters." }, { status: 400 });

    // Basic existence checks for common target types
    if (target_type === "service") {
      const { data: svc } = await supabaseAdmin.from("services").select("id").eq("id", target_id).limit(1).maybeSingle();
      if (!svc) return NextResponse.json({ error: "Service not found" }, { status: 400 });
    } else if (target_type === "user") {
      const { data: profile } = await supabaseAdmin.from("profiles").select("pi_uid").eq("pi_uid", target_id).limit(1).maybeSingle();
      if (!profile) return NextResponse.json({ error: "User not found" }, { status: 400 });
    } else if (target_type === "review") {
      const { data: rev } = await supabaseAdmin.from("reviews").select("id").eq("id", target_id).limit(1).maybeSingle();
      if (!rev) return NextResponse.json({ error: "Review not found" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.from("reports").insert(payload).select("*").single();
    if (error) {
      // Map DB constraint errors to a clean 400 rather than exposing raw DB
      return NextResponse.json({ error: "Invalid report parameters" }, { status: 400 });
    }
    return NextResponse.json({ report: data }, { status: 201 });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
