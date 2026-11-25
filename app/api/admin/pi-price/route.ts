import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin, adminError } from "@/lib/admin-route";
import { getPiUsdQuote } from "@/lib/pi-price";

// GET /api/admin/pi-price
//
// The live Pi→USD spot price for the revenue report, aggregated across public
// markets (see lib/pi-price.ts). Returns `{ quote: null }` rather than failing
// when no market can be reached, so the console can fall back gracefully.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "revenue");
    const quote = await getPiUsdQuote();
    return NextResponse.json({ quote }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return adminError(err, "pi-price");
  }
}
