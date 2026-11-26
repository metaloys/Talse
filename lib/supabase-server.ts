import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only client. NEVER import this file from a "use client" component —
// SUPABASE_SERVICE_ROLE_KEY must not reach the browser bundle.
//
// The client is created lazily. Route modules are evaluated during `next build`
// page-data collection, so a hard module-scope throw (the historical behaviour)
// broke the build for any deployment that does not yet have SUPABASE_* set —
// e.g. a brand-new project before its env is provisioned. Constructing on first
// use keeps the same clear error but surfaces it at request time instead of
// build time. Behaviour is identical when env is set.
function buildSupabaseAdmin(): SupabaseClient {
  if (!process.env.SUPABASE_URL) {
    throw new Error("SUPABASE_URL is not set");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

let supabaseInstance: SupabaseClient | null = null;

function getSupabaseAdminInstance(): SupabaseClient {
  if (!supabaseInstance) supabaseInstance = buildSupabaseAdmin();
  return supabaseInstance;
}

/**
 * Lazily-initialised admin client. Callers keep the same `supabaseAdmin.from(...)`
 * API; methods are bound to the real client. If env is missing the exact same
 * error is thrown on first use rather than at import/build time.
 */
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const real = getSupabaseAdminInstance();
    const value = Reflect.get(real, prop);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
