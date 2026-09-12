const sandboxOverride = process.env.NEXT_PUBLIC_PI_SANDBOX;
const explicitEnv = process.env.PI_ENV;

// Pi Platform API and Pi blockchain/Testnet are separate concerns.
// The user auth and Platform API endpoints must always use the Platform host,
// even when the app is running in Pi Sandbox/Testnet mode.
export const PI_PLATFORM_API_BASE = process.env.PI_PLATFORM_API_BASE ?? "https://api.minepi.com/v2";
export const PI_TESTNET_BLOCKCHAIN_API_BASE = process.env.PI_TESTNET_BLOCKCHAIN_API_BASE ?? "https://api.testnet.minepi.com";

// Legacy compatibility for older imports; do not use for browser/testnet logic.
export const PI_API_BASE = PI_PLATFORM_API_BASE;

// Historical aliases kept for compatibility with older debugging helpers.
export const PI_SANDBOX_API_BASE = process.env.PI_SANDBOX_API_BASE ?? PI_TESTNET_BLOCKCHAIN_API_BASE;
export const PI_PRODUCTION_API_BASE = process.env.PI_PRODUCTION_API_BASE ?? PI_PLATFORM_API_BASE;

export function getPiSandboxMode(): boolean {
  if (sandboxOverride !== undefined) return sandboxOverride === "true";
  if (explicitEnv === "sandbox") return true;
  if (explicitEnv === "production") return false;
  return process.env.NODE_ENV !== "production";
}

export function getPiApiBase(): string {
  return PI_PLATFORM_API_BASE;
}

export const PI_ENV_NAME = getPiSandboxMode() ? "sandbox" : "production";
export const PI_API_KEY_CONFIGURED = Boolean(process.env.PI_API_KEY);

if (process.env.NODE_ENV !== "production") {
  // Safe diagnostic log: environment + base URL only, never the API key.
  console.info("[PiEnv]", {
    environment: PI_ENV_NAME,
    platformApiBase: PI_PLATFORM_API_BASE,
    testnetBlockchainApiBase: PI_TESTNET_BLOCKCHAIN_API_BASE,
    apiKeyConfigured: PI_API_KEY_CONFIGURED,
    sandbox: getPiSandboxMode(),
  });
}
