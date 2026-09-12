import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { checkRateLimit } from "@/lib/rate-limit";
import { MESSAGE_MAX } from "@/lib/services/data";
import { makeSignedUrl } from "@/lib/storage-utils";
import { sendInAppNotifications } from "@/lib/pi-platform";

async function assertParticipant(hireRequestId: string, uid: string) {
  const { data, error } = await supabaseAdmin
    .from("hire_requests")
    .select("buyer_uid, provider_uid")
    .eq("id", hireRequestId)
    .single();
  if (error || !data) throw new Response("Hire request not found", { status: 404 });
  if (data.buyer_uid !== uid && data.provider_uid !== uid) {
    throw new Response("Forbidden", { status: 403 });
  }
}

async function validateMessageAttachmentPaths(hireRequestId: string, candidatePaths: unknown) {
  const raw = Array.isArray(candidatePaths) ? candidatePaths : [];
  const normalized = raw
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);

  if (normalized.length === 0) return [];

  const { data: listedFiles, error: listErr } = await supabaseAdmin.storage
    .from("hire-attachments")
    .list(hireRequestId, { limit: 1000 });

  if (listErr) {
    console.error("Failed to list hire-attachments for validation:", listErr);
    throw new Error("Unable to validate message attachments");
  }

  const allowed = new Set((listedFiles ?? []).map((file) => `${hireRequestId}/${file.name}`));
  const valid = [...new Set(normalized.filter((path) => path.startsWith(`${hireRequestId}/`) && allowed.has(path)))];

  if (valid.length !== normalized.length) {
    console.warn("Rejected invalid message attachment paths for hire request", { hireRequestId, received: normalized, kept: valid });
  }

  return valid;
}

// GET /api/messages?hireRequestId=...
export async function GET(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const url = new URL(req.url);
    const hireRequestId = url.searchParams.get("hireRequestId");
    const beforeParam = url.searchParams.get("before");
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.max(1, Math.min(200, Number(limitParam))) : 50;
    if (!hireRequestId) return NextResponse.json({ error: "Missing hireRequestId" }, { status: 400 });

    await assertParticipant(hireRequestId, me.uid);

    let query = supabaseAdmin.from("messages").select("*", { count: "exact" }).eq("hire_request_id", hireRequestId);

    if (!beforeParam) {
      // return the most recent `limit` messages
      const { data, count, error } = await query.order("created_at", { ascending: false }).range(0, limit - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const total = typeof count === "number" ? count : (Array.isArray(data) ? data.length : 0);
      const hasMore = (Array.isArray(data) ? data.length : 0) < total;
      const slice = (data as any[]).map((m) => ({ ...m }));
      const signedMsgs = await Promise.all(
        slice.map(async (m) => {
          const atts = Array.isArray(m.attachments) ? m.attachments : [];
          const signed = await Promise.all(atts.map((p: string) => makeSignedUrl(p, 300)));
          return { ...m, attachments: signed };
        })
      );
      // currently returned in ascending order for client rendering
      return NextResponse.json({ messages: signedMsgs.reverse(), hasMore });
    } else {
      // client provided a cursor; accept either ISO timestamp or message id
      let cursorTime: string | null = null;
      // check if beforeParam looks like an ISO timestamp
      const maybeTs = Date.parse(beforeParam);
      if (!Number.isNaN(maybeTs)) {
        cursorTime = new Date(maybeTs).toISOString();
      } else {
        // try to lookup message by id to get its created_at
        const { data: msgRow, error: msgErr } = await supabaseAdmin.from("messages").select("created_at").eq("id", beforeParam).single();
        if (msgErr || !msgRow) return NextResponse.json({ messages: [] });
        cursorTime = msgRow.created_at;
      }

      const { data, error } = await query.order("created_at", { ascending: false }).lt("created_at", cursorTime).range(0, limit - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const slice = (data as any[]).map((m) => ({ ...m }));
      const signedMsgs = await Promise.all(
        slice.map(async (m) => {
          const atts = Array.isArray(m.attachments) ? m.attachments : [];
          const signed = await Promise.all(atts.map((p: string) => makeSignedUrl(p, 300)));
          return { ...m, attachments: signed };
        })
      );
      return NextResponse.json({ messages: signedMsgs.reverse(), hasMore: (signedMsgs.length === limit) });
    }
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    // per-user rate limit for sending messages: 600 per hour (~10/min average)
    if (!(await checkRateLimit(`${me.uid}:messages:send`, 600, 3600))) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again later." }, { status: 429 });
    }
    const body = await req.json();
    const { hireRequestId, text, attachments } = body;

    if (!hireRequestId || !text?.trim()) {
      // allow messages that have attachments only
      if (!Array.isArray(attachments) || attachments.length === 0) {
        return NextResponse.json({ error: "Missing hireRequestId or text" }, { status: 400 });
      }
    }

    if (typeof text === "string" && text.trim().length > MESSAGE_MAX) {
      return NextResponse.json({ error: `Message text must be at most ${MESSAGE_MAX} characters.` }, { status: 400 });
    }
    // attachments count must not exceed attachment upload route limit (MAX_FILES = 6)
    if (Array.isArray(attachments) && attachments.length > 6) {
      return NextResponse.json({ error: "Too many attachments in message" }, { status: 400 });
    }

    await assertParticipant(hireRequestId, me.uid);

    const validAttachments = await validateMessageAttachmentPaths(hireRequestId, attachments);

    const { data, error } = await supabaseAdmin
      .from("messages")
      .insert({
        hire_request_id: hireRequestId,
        sender_uid: me.uid,
        text: text.trim(),
        attachments: validAttachments,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Fire-and-forget in-app notification to the other participant
    try {
      const { data: hr } = await supabaseAdmin
        .from("hire_requests")
        .select("buyer_uid, provider_uid")
        .eq("id", hireRequestId)
        .single();
      if (hr) {
        const otherUid = hr.buyer_uid === me.uid ? hr.provider_uid : hr.buyer_uid;
        const excerpt = typeof text === "string" && text.trim().length > 0 ? text.trim().slice(0, 140) : "Sent an attachment";
        await sendInAppNotifications([
          { title: "New message", body: excerpt, user_uid: otherUid, subroute: `/hire-requests/${hireRequestId}` },
        ]);
      }
    } catch (notifyErr) {
      console.error("[Notifications] send failed:", notifyErr);
    }
    return NextResponse.json({ message: data }, { status: 201 });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
