// Shared boilerplate for admin console API routes.
//
// The original admin routes each repeated the same verify-token /
// require-admin / catch-and-map-errors block. The console adds ~15 more
// endpoints, so the pattern lives here instead: `authorizeAdmin` resolves the
// caller's role and enforces per-section access, and `adminError` maps thrown
// errors to the right HTTP status. Existing routes are untouched.

import { NextRequest, NextResponse } from "next/server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import {
  requireAdminAccess,
  canAccessSection,
  NotAdminError,
  type AdminAccess,
  type AdminSection,
} from "@/lib/admin";

export type { AdminAccess };

/**
 * Verifies the Pi token, resolves the admin role, and — when `section` is
 * given — requires that role to have access to that console section.
 */
export async function authorizeAdmin(req: NextRequest, section?: AdminSection): Promise<AdminAccess> {
  const me = await verifyPiToken(req.headers.get("authorization"));
  const access = await requireAdminAccess(me.uid);
  if (section && !canAccessSection(access.role, section)) throw new NotAdminError();
  return access;
}

/** Maps an unknown thrown error to the JSON error shape the client expects. */
export function adminError(err: unknown, context: string): NextResponse {
  if (err instanceof NotAdminError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error(`[admin:${context}] failed:`, err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

/** Parses pagination params with sane bounds. */
export function paging(url: URL, defaultPerPage = 25): { page: number; perPage: number; from: number; to: number } {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const perPage = Math.min(200, Math.max(1, Number(url.searchParams.get("perPage") ?? String(defaultPerPage)) || defaultPerPage));
  const from = (page - 1) * perPage;
  return { page, perPage, from, to: from + perPage - 1 };
}

/** Escapes a value for the PostgREST `or` filter's ilike clause. */
export function ilikeSafe(s: string): string {
  return s.replace(/[%,()]/g, " ").trim();
}

/**
 * Records an entry in `admin_audit_events`. Console mutations call this so the
 * audit log is complete; failures are logged, never fatal, because the action
 * itself has already succeeded.
 */
export async function writeAudit(params: {
  adminUid: string;
  action: string;
  targetType: "user" | "service" | "review" | "report" | "dispute" | "order" | "category" | "settings" | "admin" | "boost";
  targetId: string;
  previousState?: unknown;
  newState?: unknown;
  reason?: string | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase-server");
    await supabaseAdmin.from("admin_audit_events").insert({
      admin_uid: params.adminUid,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId,
      previous_state: params.previousState ?? null,
      new_state: params.newState ?? null,
      reason: params.reason ?? null,
    });
  } catch (err) {
    console.error("[admin:audit] failed to write audit event:", err instanceof Error ? err.message : err);
  }
}
