import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError } from "@/lib/admin-route";
import { PI_ENV_NAME, PI_API_KEY_CONFIGURED, PI_PLATFORM_API_BASE } from "@/lib/pi-env";

// GET /api/admin/health — System Health.
//
// Answers "is the platform able to do what it promises?" in one screen:
// configuration present (Pi API key, wallet seed, Supabase, realtime signing),
// database reachable with latency, the data-layer views the console depends on,
// attachment storage usage, the payout wallet lease, and the deployed build SHA.

type Check = { name: string; ok: boolean; detail: string };

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "health");

    const started = Date.now();
    const dbProbe = await supabaseAdmin.from("profiles").select("pi_uid", { head: true, count: "exact" });
    const dbLatencyMs = Date.now() - started;

    const views = [
      "v_platform_earnings",
      "v_platform_earnings_daily",
      "v_platform_accounting",
      "v_orders_admin",
      "v_users_admin",
      "v_services_admin",
      "v_offers_admin",
      "v_boosts_admin",
      "v_messages_with_sender",
    ];
    const viewChecks = await Promise.all(
      views.map(async (v) => {
        const { error } = await supabaseAdmin.from(v).select("*", { head: true, count: "exact" }).limit(1);
        return { view: v, ok: !error, error: error?.message ?? null };
      }),
    );

    const tables = ["admin_users", "platform_settings", "events", "hire_offers", "boost_purchases"];
    const tableChecks = await Promise.all(
      tables.map(async (t) => {
        const { error } = await supabaseAdmin.from(t).select("*", { head: true, count: "exact" }).limit(1);
        return { table: t, ok: !error, error: error?.message ?? null };
      }),
    );

    // Attachment bucket usage (best-effort; a failure is not fatal).
    let storage: { ok: boolean; objects: number; detail: string };
    try {
      const { data, error } = await supabaseAdmin.storage.from("hire-attachments").list("", { limit: 1000 });
      storage = error
        ? { ok: false, objects: 0, detail: error.message }
        : { ok: true, objects: data?.length ?? 0, detail: `${data?.length ?? 0} objects at bucket root` };
    } catch (err) {
      storage = { ok: false, objects: 0, detail: err instanceof Error ? err.message : "unavailable" };
    }

    const { data: lease } = await supabaseAdmin.from("payout_wallet_lease").select("*").eq("wallet_id", "app_wallet").maybeSingle();
    const leaseActive = Boolean(lease?.lease_owner) && new Date(lease?.lease_expires_at ?? 0).getTime() > Date.now();

    const checks: Check[] = [
      { name: "Supabase reachable", ok: !dbProbe.error, detail: dbProbe.error ? dbProbe.error.message : `${dbLatencyMs} ms` },
      { name: "Pi API key configured", ok: PI_API_KEY_CONFIGURED, detail: PI_API_KEY_CONFIGURED ? "present" : "PI_API_KEY missing" },
      {
        name: "Payout wallet seed configured",
        ok: Boolean(process.env.PI_APP_WALLET_SEED?.trim()),
        detail: process.env.PI_APP_WALLET_SEED?.trim() ? "present" : "PI_APP_WALLET_SEED missing — payouts cannot be sent",
      },
      {
        name: "Realtime token signing key",
        ok: Boolean(process.env.PI_AUTH_JWT_PRIVATE_KEY && process.env.PI_AUTH_JWT_KID),
        detail: process.env.PI_AUTH_JWT_PRIVATE_KEY ? "configured" : "PI_AUTH_JWT_PRIVATE_KEY missing",
      },
      {
        name: "Admin bootstrap (ADMIN_PI_UIDS)",
        ok: Boolean(process.env.ADMIN_PI_UIDS?.trim()),
        detail: process.env.ADMIN_PI_UIDS?.trim() ? "present" : "no env admins; access depends on admin_users rows",
      },
      {
        name: "Payout wallet lease",
        ok: !leaseActive,
        detail: leaseActive ? `held by ${lease?.lease_owner} until ${lease?.lease_expires_at}` : "free",
      },
      { name: "Attachment storage", ok: storage.ok, detail: storage.detail },
    ];

    const env = {
      environment: PI_ENV_NAME,
      platformApiBase: PI_PLATFORM_API_BASE,
      buildSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      region: process.env.VERCEL_REGION ?? "unknown",
    };

    const allOk = checks.every((c) => c.ok) && viewChecks.every((v) => v.ok) && tableChecks.every((t) => t.ok);

    return NextResponse.json({
      ok: allOk,
      checks,
      views: viewChecks,
      tables: tableChecks,
      storage,
      env,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    return adminError(err, "health");
  }
}
