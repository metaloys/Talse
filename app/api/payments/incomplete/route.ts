import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { getIncompleteServerPayments } from "@/lib/pi-platform";
import { isAdmin } from "@/lib/admin";

function safePaymentSummary(payment: any) {
  const metadata = payment?.metadata ?? {};
  return {
    identifier: typeof payment?.identifier === "string" ? payment.identifier : null,
    amount: payment?.amount ?? null,
    status: payment?.status ?? null,
    memo: typeof payment?.memo === "string" ? payment.memo.slice(0, 80) : null,
    hireRequestId: typeof metadata.hireRequestId === "string" ? metadata.hireRequestId : null,
    kind: typeof metadata.kind === "string" ? metadata.kind : null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));

    if (isAdmin(me.uid)) {
      const list = await getIncompleteServerPayments();
      return NextResponse.json({ incomplete: list ?? [] });
    }

    const { data: myHireRequests } = await supabaseAdmin
      .from("hire_requests")
      .select("id")
      .or(`buyer_uid.eq.${me.uid},provider_uid.eq.${me.uid}`);

    const mySet = new Set((myHireRequests ?? []).map((row) => String(row.id)));
    const list = await getIncompleteServerPayments();

    const filtered = (list ?? []).filter((payment: any) => {
      const paymentHireRequestId = payment?.metadata?.hireRequestId;
      return typeof paymentHireRequestId === "string" && mySet.has(paymentHireRequestId);
    });

    return NextResponse.json({ incomplete: filtered });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
