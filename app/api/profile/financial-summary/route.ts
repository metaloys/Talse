import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";

function moneyValue(raw: unknown): number {
  return Number(raw) || 0;
}

export async function GET(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));

    const [buyerResult, providerResult] = await Promise.all([
      supabaseAdmin
        .from("hire_requests")
        .select("amount, status")
        .eq("buyer_uid", me.uid),
      supabaseAdmin
        .from("hire_requests")
        .select("worker_payout, status")
        .eq("provider_uid", me.uid),
    ]);

    if (buyerResult.error) {
      console.error("[GET /api/profile/financial-summary] buyer query error:", buyerResult.error);
      return NextResponse.json({ error: buyerResult.error.message }, { status: 500 });
    }

    if (providerResult.error) {
      console.error("[GET /api/profile/financial-summary] provider query error:", providerResult.error);
      return NextResponse.json({ error: providerResult.error.message }, { status: 500 });
    }

    const buyerRows = buyerResult.data ?? [];
    const providerRows = providerResult.data ?? [];

    const totalSpent = buyerRows.reduce((sum, row) => {
      if (row.status === "released") {
        return sum + moneyValue(row.amount);
      }
      return sum;
    }, 0);

    const lockedAsBuyer = buyerRows.reduce((sum, row) => {
      if (["locked", "delivered", "disputed"].includes(row.status)) {
        return sum + moneyValue(row.amount);
      }
      return sum;
    }, 0);

    const owedToYou = providerRows.reduce((sum, row) => {
      if (["locked", "delivered", "disputed"].includes(row.status)) {
        return sum + moneyValue(row.worker_payout);
      }
      return sum;
    }, 0);

    return NextResponse.json({
      totalSpent,
      lockedAsBuyer,
      owedToYou,
    });
  } catch (err) {
    if (err instanceof PiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/profile/financial-summary] unexpected:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
