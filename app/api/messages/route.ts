import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";

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

// GET /api/messages?hireRequestId=...
export async function GET(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const hireRequestId = new URL(req.url).searchParams.get("hireRequestId");
    if (!hireRequestId) return NextResponse.json({ error: "Missing hireRequestId" }, { status: 400 });

    await assertParticipant(hireRequestId, me.uid);

    const { data, error } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("hire_request_id", hireRequestId)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ messages: data });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const { hireRequestId, text } = await req.json();
    if (!hireRequestId || !text?.trim()) {
      return NextResponse.json({ error: "Missing hireRequestId or text" }, { status: 400 });
    }

    await assertParticipant(hireRequestId, me.uid);

    const { data, error } = await supabaseAdmin
      .from("messages")
      .insert({ hire_request_id: hireRequestId, sender_uid: me.uid, text: text.trim() })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ message: data }, { status: 201 });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
