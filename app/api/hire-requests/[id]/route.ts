import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { makeSignedUrl } from "@/lib/storage-utils";
import { sendInAppNotifications } from "@/lib/pi-platform";
import { assertNotSuspended, SuspendedError } from "@/lib/suspension";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const me = await verifyPiToken(req.headers.get("authorization"));
        const { data, error } = await supabaseAdmin
          .from("hire_requests")
          .select("id, service_id, buyer_uid, provider_uid, message, deadline, attachments, status, amount, created_at")
          .eq("id", id)
          .single();
    if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (data.buyer_uid !== me.uid && data.provider_uid !== me.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
        // convert storage paths to short-lived signed URLs for attachments
        const attachments = Array.isArray(data.attachments) ? data.attachments : [];
        const signed = await Promise.all(attachments.map((p: string) => makeSignedUrl(p, 300)));
        const out = { ...data, attachments: signed };
        return NextResponse.json({ request: out });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Status transitions that don't involve money:
//   pending   -> accepted   (provider)
//   pending   -> cancelled  (buyer or provider)
//   locked    -> delivered  (provider marks work delivered)
//   any       -> disputed   (either party)
// "locked" (escrow funded) and "released"/"refunded" are NOT set here — those
// only happen via /api/payments/* once a real payment/contract call confirms
// on-chain. This route never lets a client claim money moved.
const ALLOWED_TRANSITIONS: Record<string, { from: string[]; by: "buyer" | "provider" | "either" }> = {
  accepted: { from: ["pending"], by: "provider" },
  cancelled: { from: ["pending", "accepted"], by: "either" },
  delivered: { from: ["locked"], by: "provider" },
  disputed: { from: ["locked", "delivered"], by: "either" },
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const me = await verifyPiToken(req.headers.get("authorization"));
    const { status: nextStatus, reason, details, evidence } = await req.json();

    const rule = ALLOWED_TRANSITIONS[nextStatus];
    if (!rule) {
      return NextResponse.json({ error: `Unsupported transition to '${nextStatus}'` }, { status: 400 });
    }

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("hire_requests")
      .select("buyer_uid, provider_uid, status")
      .eq("id", id)
      .single();
    if (fetchErr || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isBuyer = existing.buyer_uid === me.uid;
    const isProvider = existing.provider_uid === me.uid;

    if (nextStatus === "accepted" && isProvider) {
      await assertNotSuspended(me.uid);
    }
    if (!isBuyer && !isProvider) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (rule.by === "buyer" && !isBuyer) return NextResponse.json({ error: "Only the buyer may do this" }, { status: 403 });
    if (rule.by === "provider" && !isProvider) return NextResponse.json({ error: "Only the provider may do this" }, { status: 403 });
    if (!rule.from.includes(existing.status)) {
      return NextResponse.json(
        { error: `Cannot move from '${existing.status}' to '${nextStatus}'` },
        { status: 409 }
      );
    }

    const update: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === "disputed") {
      // Validate dispute fields before writing
      if (reason !== undefined && reason !== null && typeof reason !== "string") {
        return NextResponse.json({ error: "Invalid dispute reason" }, { status: 400 });
      }
      if (details !== undefined && details !== null && typeof details !== "string") {
        return NextResponse.json({ error: "Invalid dispute details" }, { status: 400 });
      }
      if (evidence !== undefined && evidence !== null && !Array.isArray(evidence)) {
        return NextResponse.json({ error: "Invalid dispute evidence" }, { status: 400 });
      }
      if (typeof reason === "string" && reason.trim().length > 200) {
        return NextResponse.json({ error: "Dispute reason must be at most 200 characters." }, { status: 400 });
      }
      if (typeof details === "string" && details.trim().length > 4000) {
        return NextResponse.json({ error: "Dispute details must be at most 4000 characters." }, { status: 400 });
      }
      if (Array.isArray(evidence) && evidence.length > 10) {
        return NextResponse.json({ error: "Dispute evidence may include at most 10 items." }, { status: 400 });
      }

      update.dispute_filed_by = me.uid;
      update.dispute_reason = typeof reason === "string" ? reason.slice(0, 200) : null;
      update.dispute_details = typeof details === "string" ? details.slice(0, 4000) : null;
      update.dispute_evidence = Array.isArray(evidence) ? evidence.slice(0, 10) : [];
      update.dispute_stage = null; // reset — a fresh dispute always starts unreviewed
      update.admin_note = null;
    }

    const { data, error } = await supabaseAdmin
      .from("hire_requests")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Fire-and-forget in-app notification to the other participant
    try {
      const otherUid = existing.buyer_uid === me.uid ? existing.provider_uid : existing.buyer_uid;
      const titleMap: Record<string, string> = {
        accepted: "Request accepted",
        cancelled: "Request cancelled",
        delivered: "Work delivered",
        disputed: "Dispute filed",
      };
      const bodyMap: Record<string, string> = {
        accepted: "Your hire request was accepted.",
        cancelled: "A hire request was cancelled.",
        delivered: "Work has been marked delivered.",
        disputed: "A dispute was filed for your request.",
      };
      const title = titleMap[nextStatus] ?? "Request updated";
      const body = bodyMap[nextStatus] ?? `Request status changed to ${nextStatus}`;
      await sendInAppNotifications([
        { title, body, user_uid: otherUid, subroute: `/hire-requests/${id}` },
      ]);
    } catch (notifyErr) {
      console.error("[Notifications] send failed:", notifyErr);
    }

    return NextResponse.json({ request: data });
  } catch (err) {
    if (err instanceof SuspendedError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
