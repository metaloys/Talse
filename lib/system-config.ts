import { getPiSandboxMode } from "@/lib/pi-env";

// The Sandbox/Production decision has a single source of truth in lib/pi-env.ts
// (getPiSandboxMode). A second copy here is exactly what let the client and the
// server disagree: NEXT_PUBLIC_PI_SANDBOX is the one flag the browser can see,
// so keep PI_ENV (server-only) in step with it. lib/pi-env warns in dev when the
// two diverge.
const SANDBOX = getPiSandboxMode();

export const PI_NETWORK_CONFIG = {
  SDK_URL: "https://sdk.minepi.com/pi-sdk.js",
  SDK_LITE_URL: "https://pi-apps.github.io/pi-sdk-lite/build/production/sdklite.js",
  // External user-state/auth backend. Overridable so the app does not hard-depend
  // on one host; falls back to the App Studio default.
  BACKEND_URL:
    process.env.NEXT_PUBLIC_PI_APPSTUDIO_BACKEND ?? "https://backend.appstudio-u7cm9zhmha0ruwv8.piappengine.com",
  SANDBOX,
  PI_API_BASE: SANDBOX
    ? process.env.PI_SANDBOX_API_BASE ?? "https://api.testnet.minepi.com/v2"
    : process.env.PI_PRODUCTION_API_BASE ?? "https://api.minepi.com/v2",
} as const;
