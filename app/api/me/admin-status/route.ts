import { NextRequest, NextResponse } from "next/server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { isAdmin } from "@/lib/admin";

export async function GET(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    return NextResponse.json({ isAdmin: isAdmin(me.uid) });
  } catch (err) {
    if (err instanceof PiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/me/admin-status] unexpected:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
