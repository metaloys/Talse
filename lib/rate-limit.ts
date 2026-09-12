import { supabaseAdmin } from "@/lib/supabase-server";

export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("[rate-limit] check failed, allowing request:", error.message);
      return true;
    }
    return data === true;
  } catch (err: any) {
    console.error("[rate-limit] unexpected error, allowing request:", err?.message ?? err);
    return true;
  }
}
