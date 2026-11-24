/**
 * Admin access control.
 *
 * Access has two sources:
 *
 *   1. ADMIN_PI_UIDS (server-only env) — the bootstrap. Anyone listed there is
 *      treated as `owner`, and is recorded in `admin_users` on first use so the
 *      platform has a durable record of who has access and with what role.
 *   2. The `admin_users` table (migration 011) — additional admins with
 *      narrower roles, managed from the console itself.
 *
 * `isAdmin`/`requireAdmin` remain the synchronous env-only check used by the
 * original routes, so nothing that worked before changes behaviour. New console
 * routes use the async `requireAdminAccess` / `requireSection` helpers, which
 * also understand roles.
 */

import { supabaseAdmin } from "@/lib/supabase-server";

export const ADMIN_ROLES = ["owner", "ops", "finance", "support", "readonly"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Higher wins. Used for "at least this role" checks. */
const ROLE_RANK: Record<AdminRole, number> = {
  owner: 4,
  ops: 3,
  finance: 3,
  support: 2,
  readonly: 1,
};

export type AdminAccess = { uid: string; role: AdminRole; source: "env" | "table" };

// ---- env bootstrap (unchanged semantics) ----
function envAdminUids(): string[] {
  return (process.env.ADMIN_PI_UIDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdmin(uid: string): boolean {
  return envAdminUids().includes(uid);
}

export class NotAdminError extends Error {
  status = 403;
  constructor() {
    super("Admin access required");
    this.name = "NotAdminError";
  }
}

/** Synchronous, env-only gate. Used by the original admin routes. */
export function requireAdmin(uid: string): void {
  if (!isAdmin(uid)) throw new NotAdminError();
}

// ---- role-aware resolution ----
let tableReady = false;

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || /does not exist/i.test(error.message ?? "");
}

/**
 * Resolves an admin's role, or null when they have no access at all. Env-listed
 * uids are `owner`; everything else comes from `admin_users`. The result is not
 * cached here because `verifyPiToken` already runs per request and the row is
 * tiny; if this ever becomes hot, cache it per-process with a short TTL.
 */
export async function resolveAdmin(uid: string): Promise<AdminAccess | null> {
  if (isAdmin(uid)) {
    // Keep the table in sync with the env bootstrap so the console can show
    // *who* has access even when it was granted via the env var.
    try {
      const { data } = await supabaseAdmin.from("admin_users").select("pi_uid").eq("pi_uid", uid).maybeSingle();
      if (!data) {
        await supabaseAdmin
          .from("admin_users")
          .upsert(
            { pi_uid: uid, role: "owner", granted_by: "env:ADMIN_PI_UIDS", notes: "Bootstrapped from ADMIN_PI_UIDS" },
            { onConflict: "pi_uid" },
          );
      }
    } catch (err) {
      if (!isMissingTable(err as { code?: string; message?: string } | null)) {
        console.error("[admin] could not record env admin:", err instanceof Error ? err.message : err);
      }
    }
    return { uid, role: "owner", source: "env" };
  }

  try {
    const { data, error } = await supabaseAdmin.from("admin_users").select("role").eq("pi_uid", uid).maybeSingle();
    if (error) {
      if (isMissingTable(error)) {
        tableReady = false;
        return null;
      }
      throw error;
    }
    if (!data) return null;
    tableReady = true;
    const role = (ADMIN_ROLES as readonly string[]).includes(data.role) ? (data.role as AdminRole) : "readonly";
    return { uid, role, source: "table" };
  } catch (err) {
    console.error("[admin] role lookup failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Async gate for console routes: throws NotAdminError when there is no access. */
export async function requireAdminAccess(uid: string): Promise<AdminAccess> {
  const access = await resolveAdmin(uid);
  if (!access) throw new NotAdminError();
  // Touch last_seen without blocking the response.
  if (access.source === "table" && tableReady) {
    void supabaseAdmin
      .from("admin_users")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("pi_uid", uid)
      .then(
        () => undefined,
        () => undefined,
      );
  }
  return access;
}

/** Async gate requiring at least one of `allowed` (default: any admin). */
export async function requireAdminRole(uid: string, allowed?: readonly AdminRole[]): Promise<AdminAccess> {
  const access = await requireAdminAccess(uid);
  if (allowed && allowed.length > 0 && !allowed.includes(access.role)) {
    throw new NotAdminError();
  }
  return access;
}

export function atLeast(role: AdminRole, minimum: AdminRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

// ---- which roles may open which console section ----
export type AdminSection =
  | "overview"
  | "live"
  | "orders"
  | "escrow"
  | "payments"
  | "offers"
  | "listings"
  | "categories"
  | "boosts"
  | "users"
  | "providers"
  | "reviews"
  | "reports"
  | "disputes"
  | "conversations"
  | "trust"
  | "revenue"
  | "fees"
  | "analytics"
  | "exports"
  | "audit"
  | "admins"
  | "configuration"
  | "health";

/** Any role in the list may read the section; owner may do everything. */
export const SECTION_ACCESS: Record<AdminSection, readonly AdminRole[]> = {
  overview: ADMIN_ROLES,
  live: ADMIN_ROLES,
  orders: ADMIN_ROLES,
  escrow: ["owner", "finance", "ops"],
  payments: ["owner", "finance", "ops"],
  offers: ADMIN_ROLES,
  listings: ADMIN_ROLES,
  categories: ["owner", "ops"],
  boosts: ADMIN_ROLES,
  users: ADMIN_ROLES,
  providers: ADMIN_ROLES,
  reviews: ["owner", "ops", "support"],
  reports: ["owner", "ops", "support"],
  disputes: ["owner", "ops", "support"],
  conversations: ["owner", "ops", "support"],
  trust: ["owner", "ops"],
  revenue: ["owner", "finance"],
  fees: ["owner", "finance"],
  analytics: ["owner", "ops", "finance"],
  exports: ["owner", "finance", "ops"],
  audit: ["owner", "ops"],
  admins: ["owner"],
  configuration: ["owner"],
  health: ["owner", "ops"],
};

export function canAccessSection(role: AdminRole, section: AdminSection): boolean {
  return SECTION_ACCESS[section].includes(role);
}

export function allowedSections(role: AdminRole): AdminSection[] {
  return (Object.keys(SECTION_ACCESS) as AdminSection[]).filter((s) => canAccessSection(role, s));
}
