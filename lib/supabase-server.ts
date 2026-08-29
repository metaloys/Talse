import { createClient } from "@supabase/supabase-js";

// Server-only client. NEVER import this file from a "use client" component —
// SUPABASE_SERVICE_ROLE_KEY must not reach the browser bundle.
if (!process.env.SUPABASE_URL) {
  throw new Error("SUPABASE_URL is not set");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
}

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
