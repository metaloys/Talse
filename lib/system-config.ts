const sandboxOverride = process.env.NEXT_PUBLIC_PI_SANDBOX;

export const PI_NETWORK_CONFIG = {
  SDK_URL: "https://sdk.minepi.com/pi-sdk.js",
  SDK_LITE_URL: "https://pi-apps.github.io/pi-sdk-lite/build/production/sdklite.js",
  BACKEND_URL: "https://backend.appstudio-u7cm9zhmha0ruwv8.piappengine.com",
  SANDBOX:
    sandboxOverride === undefined
      ? process.env.NODE_ENV !== "production"
      : sandboxOverride === "true",
  PI_API_BASE:
    sandboxOverride === "true" || (sandboxOverride === undefined && process.env.NODE_ENV !== "production")
      ? process.env.PI_SANDBOX_API_BASE ?? "https://api.testnet.minepi.com/v2"
      : process.env.PI_PRODUCTION_API_BASE ?? "https://api.minepi.com/v2",
} as const;
