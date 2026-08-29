/**
 * Minimal admin gate: a comma-separated list of Pi uids in ADMIN_PI_UIDS
 * (server-only env var) are treated as platform admins, able to resolve
 * disputes regardless of whose hire_request it is.
 *
 * This is intentionally simple for v1 — no roles table, no UI for managing
 * admins. If you need more than a handful of admins or an audit trail of
 * who granted access, move this to a `admins` table instead.
 */
export function isAdmin(uid: string): boolean {
  const list = (process.env.ADMIN_PI_UIDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(uid);
}

export class NotAdminError extends Error {
  status = 403;
  constructor() {
    super("Admin access required");
    this.name = "NotAdminError";
  }
}

export function requireAdmin(uid: string): void {
  if (!isAdmin(uid)) throw new NotAdminError();
}
