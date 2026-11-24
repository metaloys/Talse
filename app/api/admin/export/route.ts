import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError } from "@/lib/admin-route";

// GET /api/admin/export?dataset=orders|ledger|boosts|users|offers|events|audit[&range=&status=]
//
// One CSV download per dataset — what finance and moderation actually need when
// they have to work outside the console. Rows come straight from the same views
// the screens use, so the export can never disagree with the screen.

type Dataset = {
  source: string;
  columns: string[];
  order: { column: string; ascending: boolean };
  dateColumn?: string;
  statusColumn?: string;
  limit: number;
};

const DATASETS: Record<string, Dataset> = {
  orders: {
    source: "v_orders_admin",
    columns: [
      "id", "created_at", "updated_at", "status", "payout_status", "amount", "platform_fee", "worker_payout",
      "blockchain_fee", "service_title", "buyer_name", "provider_name", "lock_txid", "release_txid", "refund_txid",
      "message_count",
    ],
    order: { column: "created_at", ascending: false },
    dateColumn: "created_at",
    statusColumn: "status",
    limit: 10000,
  },
  ledger: {
    source: "v_platform_accounting",
    columns: ["id", "created_at", "amount", "platform_fee", "worker_payout", "blockchain_fee", "platform_net", "accounting_status", "release_txid", "refund_txid"],
    order: { column: "created_at", ascending: false },
    dateColumn: "created_at",
    limit: 10000,
  },
  boosts: {
    source: "v_boosts_admin",
    columns: ["id", "created_at", "service_title", "buyer_name", "amount", "blockchain_fee", "payment_id", "txid", "boosted_until"],
    order: { column: "created_at", ascending: false },
    dateColumn: "created_at",
    limit: 10000,
  },
  users: {
    source: "v_users_admin",
    columns: [
      "pi_uid", "username", "display_name", "created_at", "rating_avg", "rating_count", "jobs_completed",
      "refunds_against_provider", "total_earned", "listings_count", "orders_as_buyer", "orders_as_provider",
      "reports_against", "boost_spend", "suspended_at", "suspension_reason",
    ],
    order: { column: "created_at", ascending: false },
    dateColumn: "created_at",
    limit: 10000,
  },
  offers: {
    source: "v_offers_admin",
    columns: ["id", "created_at", "service_title", "proposer_name", "amount", "request_amount", "status", "responded_at", "hire_request_id"],
    order: { column: "created_at", ascending: false },
    dateColumn: "created_at",
    statusColumn: "status",
    limit: 10000,
  },
  events: {
    source: "events",
    columns: ["id", "created_at", "name", "pi_uid", "session_id", "props"],
    order: { column: "created_at", ascending: false },
    dateColumn: "created_at",
    limit: 50000,
  },
  reports: {
    source: "reports",
    columns: ["id", "created_at", "target_type", "target_id", "reporter_uid", "reason", "details", "status", "admin_note", "resolved_by"],
    order: { column: "created_at", ascending: false },
    dateColumn: "created_at",
    statusColumn: "status",
    limit: 20000,
  },
  audit: {
    source: "admin_audit_events",
    columns: ["id", "created_at", "admin_uid", "action", "target_type", "target_id", "reason"],
    order: { column: "created_at", ascending: false },
    dateColumn: "created_at",
    limit: 20000,
  },
};

function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
}

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "exports");

    const url = new URL(req.url);
    const name = url.searchParams.get("dataset") ?? "orders";
    const def = DATASETS[name];
    if (!def) return NextResponse.json({ error: `Unknown dataset '${name}'` }, { status: 400 });

    const range = url.searchParams.get("range") ?? "all";
    const status = url.searchParams.get("status");

    let query = supabaseAdmin.from(def.source).select(def.columns.join(", ")).order(def.order.column, { ascending: def.order.ascending }).limit(def.limit);
    if (def.dateColumn && range !== "all") {
      const since = new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte(def.dateColumn, since);
    }
    if (status && def.statusColumn && status !== "all") query = query.eq(def.statusColumn, status);

    const { data, error } = await query;
    if (error) {
      console.error(`[admin:export] ${name} failed:`, error.message);
      return NextResponse.json({ error: "Export failed." }, { status: 500 });
    }

    const csv = toCsv((data ?? []) as unknown as Array<Record<string, unknown>>, def.columns);
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="talse-${name}-${stamp}.csv"`,
      },
    });
  } catch (err) {
    return adminError(err, "export");
  }
}
