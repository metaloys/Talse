import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertNotSuspended, SuspendedError } from "@/lib/suspension";
import { sendInAppNotifications } from "@/lib/pi-platform";

const MAX_AMOUNT = 100000;

/**
 * POST /api/hire-requests/[id]/offers
 *
 * Propose a different price for a pending hire request. Either party may
 * propose; a new proposal supersedes any earlier live one. Money never moves
 * here — accepting an offer (see ./respond) is what sets the agreed amount.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const { id } = await params;

    if (!(await checkRateLimit(`${me.uid}:offers:create`, 40, 24 * 3600))) {
      return NextResponse.json({ error: "Too many offers today. Try again later." }, { status: 429 });
    }
    await assertNotSuspended(me.uid);

    const body = await req.json().catch(() => ({}));
    const rawAmount = Number(body?.amount);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0 || rawAmount > MAX_AMOUNT) {
      return NextResponse.json({ error: "Enter an amount between 0 and 100000 π" }, { status: 400 });
    }
    const amount = Math.round(rawAmount * 100) / 100;
    const message = typeof body?.message === "string" ? body.message.trim().slice(0, 300) : null;

    const { data: hr, error: fetchErr } = await supabaseAdmin
      .from("hire_requests")
      .select("id, buyer_uid, provider_uid, status, amount")
      .eq("id", id)
      .single();
    if (fetchErr || !hr) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (hr.buyer_uid !== me.uid && hr.provider_uid !== me.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (hr.status !== "pending") {
      return NextResponse.json({ error: "Only pending requests can be renegotiated" }, { status: 409 });
    }
    if (Number(hr.amount) === amount) {
      return NextResponse.json({ error: "That is already the agreed price" }, { status: 400 });
    }

    // Only one live offer at a time: retire the previous one first.
    await supabaseAdmin
      .from("hire_offers")
      .update({ status: "superseded", responded_at: new Date().toISOString() })
      .eq("hire_request_id", id)
      .eq("status", "pending");

    const { data: offer, error: insertErr } = await supabaseAdmin
      .from("hire_offers")
      .insert({ hire_request_id: id, proposer_uid: me.uid, amount, message, status: "pending" })
      .select()
      .single();
    if (insertErr || !offer) {
      console.error("[offers] insert failed:", insertErr?.message);
      return NextResponse.json({ error: "Could not send the offer" }, { status: 500 });
    }

    const otherUid = hr.buyer_uid === me.uid ? hr.provider_uid : hr.buyer_uid;
    try {
      await sendInAppNotifications([
        {
          title: "New price offer",
          body: `${me.username} proposed ${amount} π. Accept or decline in Talse.`,
          user_uid: otherUid,
          subroute: `/hire-requests/${id}`,
        },
      ]);
    } catch (notifyErr) {
      console.error("[Notifications] offer notify failed:", notifyErr instanceof Error ? notifyErr.message : notifyErr);
    }

    return NextResponse.json({ offer }, { status: 201 });
  } catch (err) {
    if (err instanceof SuspendedError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[offers] failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
