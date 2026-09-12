import { supabaseAdmin } from "@/lib/supabase-server";

export class SuspendedError extends Error {
  status = 403;
  constructor(message = "This account is suspended and cannot perform this action.") {
    super(message);
    this.name = "SuspendedError";
  }
}

export async function assertNotSuspended(uid: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("suspended_at")
    .eq("pi_uid", uid)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data && data.suspended_at && new Date(data.suspended_at).getTime() > 0) {
    throw new SuspendedError();
  }
}
