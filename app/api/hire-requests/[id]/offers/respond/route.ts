import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertNotSuspended, SuspendedError } from "@/lib/suspension";
import { sendInAppNotifications } from "@/lib/pi-platform";

/**
 * POST /api/hire-requests/[id]/offers/respond
 * Body: { offerId: string, accept: boolean }
 *
 * The party who did NOT propose the offer accepts or declines it. Accepting is
 * the hire agreement: the agreed amount is written to the request and it moves
 * to 'accepted', which is the only state escrow can be funded from.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const { id } = await params;

    if (!(await checkRateLimit(`${me.uid}:offers:respond`, 120, 24 * 3600))) {
      return NextResponse.json({ error: "Too many attempts today. Try again later." }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const offerId = typeof body?.offerId === "string" ? body.offerId : "";
    const accept = body?.accept === true;
    if (!offerId) return NextResponse.json({ error: "offerId is required" }, { status: 400 });

    const { data: offer, error: offerErr } = await supabaseAdmin
      .from("hire_offers")
      .select("id, hire_request_id, proposer_uid, amount, status")
      .eq("id", offerId)
      .eq("hire_request_id", id)
      .single();
    if (offerErr || !offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    if (offer.status !== "pending") {
      return NextResponse.json({ error: "This offer is no longer open" }, { status: 409 });
    }
    if (offer.proposer_uid === me.uid) {
      return NextResponse.json({ error: "You cannot respond to your own offer" }, { status: 403 });
    }

    const { data: hr, error: hrErr } = await supabaseAdmin
      .from("hire_requests")
      .select("id, buyer_uid, provider_uid, status, amount")
      .eq("id", id)
      .single();
    if (hrErr || !hr) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (hr.buyer_uid !== me.uid && hr.provider_uid !== me.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (hr.status !== "pending") {
      return NextResponse.json({ error: "This request is no longer open for negotiation" }, { status: 409 });
    }
    if (accept) {
      // A provider agreeing to a price is also agreeing to do the work.
      await assertNotSuspended(hr.provider_uid);
    }

    const now = new Date().toISOString();
    const { data: updatedOffer, error: updateOfferErr } = await supabaseAdmin
      .from("hire_offers")
      .update({ status: accept ? "accepted" : "declined", responded_at: now })
      .eq("id", offerId)
      .eq("status", "pending")
      .select()
      .single();
    if (updateOfferErr || !updatedOffer) {
      return NextResponse.json({ error: "This offer is no longer open" }, { status: 409 });
    }

    let request = hr;
    if (accept) {
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("hire_requests")
        .update({ amount: offer.amount, status: "accepted" })
        .eq("id", id)
        .eq("status", "pending")
        .select()
        .single();
      if (updateErr || !updated) {
        // Roll the offer back so the two records cannot disagree.
        await supabaseAdmin.from("hire_offers").update({ status: "pending", responded_at: null }).eq("id", offerId);
        return NextResponse.json({ error: "This request changed. Refresh and try again." }, { status: 409 });
      }
      request = updated;
    }

    try {
      const responderIsBuyer = hr.buyer_uid === me.uid;
      await sendInAppNotifications([
        {
          title: accept ? "Offer accepted" : "Offer declined",
          body: accept
            ? responderIsBuyer
              ? `The buyer accepted ${offer.amount} π. Fund the escrow to start.`
              : `The provider accepted ${offer.amount} π. Fund the escrow to start.`
            : `${me.username} declined your offer of ${offer.amount} π.`,
          user_uid: offer.proposer_uid,
          subroute: `/hire-requests/${id}`,
        },
      ]);
    } catch (notifyErr) {
      console.error("[Notifications] offer response notify failed:", notifyErr instanceof Error ? notifyErr.message : notifyErr);
    }

    return NextResponse.json({ offer: updatedOffer, request });
  } catch (err) {
    if (err instanceof SuspendedError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[offers:respond] failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
