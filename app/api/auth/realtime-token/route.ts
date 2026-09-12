import { NextRequest, NextResponse } from "next/server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { mintRealtimeToken } from "@/lib/realtime-auth";

export async function GET(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    const token = await mintRealtimeToken(me.uid);
    return NextResponse.json({ token });
  } catch (err) {
    if (err instanceof PiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/auth/realtime-token] unexpected:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
