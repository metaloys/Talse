import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { mintRealtimeToken } from "../lib/realtime-auth";

// Provide a Node WebSocket implementation on globalThis so libraries
// that expect a browser WebSocket can operate in Node for this harness.
(globalThis as any).WebSocket = ws as any;

const HIRE_REQUEST_ID = process.env.TEST_HIRE_REQUEST_ID || "46484d57-95a2-45fe-9ffe-aa4fb15c1eae";
const BUYER_PI_UID = process.env.TEST_BUYER_PI_UID || "2c20fef5-163b-4f4b-bb76-3a43e47f3467";
const PROVIDER_PI_UID = process.env.TEST_PROVIDER_PI_UID || "31fe8579-b9e3-4622-90fa-5b9e351f3960";
const UNRELATED_PI_UID = "unrelated-test-uid-" + Math.random().toString(36).slice(2);

function clientFor(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      accessToken: async () => token,
      realtime: { transport: ws as any },
    }
  );
}

function subscribeAndWait(client: ReturnType<typeof clientFor>, topic: string, timeoutMs = 6000): Promise<string> {
  return new Promise((resolve) => {
    const channel = client.channel(topic, { config: { private: true } });
    const timer = setTimeout(() => {
      channel.unsubscribe();
      resolve("TIMEOUT");
    }, timeoutMs);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "CLOSED" || status === "TIMED_OUT") {
        clearTimeout(timer);
        const result = status;
        channel.unsubscribe();
        resolve(result);
      }
    });
  });
}

async function testSubscribe(label: string, piUid: string, expectAllowed: boolean) {
  const token = await mintRealtimeToken(piUid);
  const client = clientFor(token);
  const status = await subscribeAndWait(client, `hire_request:${HIRE_REQUEST_ID}`);
  const allowed = status === "SUBSCRIBED";
  const pass = allowed === expectAllowed;
  console.log(`[${pass ? "PASS" : "FAIL"}] ${label}: status=${status}, expected allowed=${expectAllowed}`);
  return pass;
}

async function testDirectTableRead(label: string, piUid: string) {
  const token = await mintRealtimeToken(piUid);
  const client = clientFor(token);
  const { data, error } = await client.from("hire_requests").select("id").limit(5);
  const blocked = !!error || !data || data.length === 0;
  console.log(`[${blocked ? "PASS" : "FAIL"}] ${label}: error=${error?.message ?? "none"}, rowCount=${data?.length ?? 0}`);
  return blocked;
}

async function main() {
  const results: boolean[] = [];
  results.push(await testSubscribe("Test 1: buyer can subscribe", BUYER_PI_UID, true));
  results.push(await testSubscribe("Test 2: provider can subscribe", PROVIDER_PI_UID, true));
  results.push(await testSubscribe("Test 3: unrelated user denied", UNRELATED_PI_UID, false));
  results.push(await testDirectTableRead("Test 4a: buyer cannot read hire_requests table directly", BUYER_PI_UID));
  results.push(await testDirectTableRead("Test 4b: unrelated user cannot read hire_requests table directly", UNRELATED_PI_UID));

  const allPass = results.every(Boolean);
  console.log(allPass ? "\nALL TESTS PASSED" : "\nSOME TESTS FAILED");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("Harness failed to run:", e);
  process.exit(1);
});
