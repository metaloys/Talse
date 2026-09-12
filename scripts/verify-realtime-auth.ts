import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { mintRealtimeToken } from "../lib/realtime-auth";

async function main() {
  const token = await mintRealtimeToken("test-verification-uid-001");
  console.log("Minted token (safe to print, short-lived, test uid):");
  console.log(token);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { accessToken: async () => token }
  );

  const { data, error } = await supabase.rpc("debug_whoami");
  console.log("debug_whoami result:", JSON.stringify(data, null, 2));
  if (error) console.error("RPC error:", error);
}

main().catch((e) => {
  console.error("Verification failed:", e);
  process.exit(1);
});
