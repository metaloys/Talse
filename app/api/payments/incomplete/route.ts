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
      console.log("[PiDebug] getIncompleteServerPayments() raw admin result", {
        count: (list ?? []).length,
        payments: (list ?? []).slice(0, 20).map(safePaymentSummary),
      });
      return NextResponse.json({ incomplete: list ?? [] });
    }

    const { data: myHireRequests } = await supabaseAdmin
      .from("hire_requests")
      .select("id")
      .or(`buyer_uid.eq.${me.uid},provider_uid.eq.${me.uid}`);

    const mySet = new Set((myHireRequests ?? []).map((row) => String(row.id)));
    const targetHireRequestId = "a86150df-28ab-454c-93dc-61f2957abe0a";
    const list = await getIncompleteServerPayments();

    console.log("[PiDebug] getIncompleteServerPayments() raw result", {
      count: (list ?? []).length,
      payments: (list ?? []).slice(0, 20).map(safePaymentSummary),
    });

    console.log("[PiDebug] myHireRequests ids", {
      count: (myHireRequests ?? []).length,
      ids: (myHireRequests ?? []).map((row) => String(row.id)),
      targetPresent: mySet.has(targetHireRequestId),
      targetHireRequestId,
    });

    const decisions: Array<{
      identifier: string | null;
      paymentHireRequestId: string | null;
      inMySet: boolean;
      finalIncluded: boolean;
    }> = (list ?? []).map((payment: any) => {
      const paymentHireRequestId = payment?.metadata?.hireRequestId;
      const inMySet = typeof paymentHireRequestId === "string" && mySet.has(paymentHireRequestId);
      return {
        identifier: typeof payment?.identifier === "string" ? payment.identifier : null,
        paymentHireRequestId: typeof paymentHireRequestId === "string" ? paymentHireRequestId : null,
        inMySet,
        finalIncluded: typeof paymentHireRequestId === "string" && mySet.has(paymentHireRequestId),
      };
    });

    console.log("[PiDebug] filter decisions", {
      decisions: decisions.slice(0, 20),
      removedCount: decisions.filter((d) => !d.finalIncluded).length,
      targetPresentInDecisions: decisions.some((d) => d.paymentHireRequestId === targetHireRequestId),
    });

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
