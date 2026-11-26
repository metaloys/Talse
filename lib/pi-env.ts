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

// Network id + Horizon endpoint used to *sign and submit* app_to_user (escrow
// release / refund) transactions. Testnet is the default so current behaviour is
// unchanged; a Production (Mainnet) deployment must set both explicitly. Pi
// Mainnet's passphrase is "Pi Network" and its Horizon base is the Mainnet host.
export const PI_NETWORK_PASSPHRASE = process.env.PI_NETWORK_PASSPHRASE ?? "Pi Testnet";
export const PI_HORIZON_URL = process.env.PI_HORIZON_URL ?? PI_TESTNET_BLOCKCHAIN_API_BASE;

// Exported for the RPC/verification helpers that speak to the same network.
export const PI_RPC_URL = process.env.PI_RPC_URL ?? "https://rpc.testnet.minepi.com";

const PI_MAINNET_PASSPHRASE = "Pi Network";

export function getPiSandboxMode(): boolean {
  if (sandboxOverride !== undefined) return sandboxOverride === "true";
  if (explicitEnv === "sandbox") return true;
  if (explicitEnv === "production") return false;
  return process.env.NODE_ENV !== "production";
}

/**
 * Guard for money-out: on Production the network must actually be Pi Mainnet,
 * otherwise a signed transaction could never settle (wrong network id) and the
 * platform would silently strand buyer Pi in escrow. No-op on Sandbox/Testnet.
 */
export function assertPayoutNetworkConfigured(): void {
  if (!getPiSandboxMode() && PI_NETWORK_PASSPHRASE !== PI_MAINNET_PASSPHRASE) {
    throw new Error(
      `Refusing to send payouts: production mode requires PI_NETWORK_PASSPHRASE="${PI_MAINNET_PASSPHRASE}" and a Mainnet PI_HORIZON_URL (got passphrase "${PI_NETWORK_PASSPHRASE}").`,
    );
  }
}

export function getPiApiBase(): string {
  return PI_PLATFORM_API_BASE;
}

export const PI_ENV_NAME = getPiSandboxMode() ? "sandbox" : "production";
export const PI_API_KEY_CONFIGURED = Boolean(process.env.PI_API_KEY);

// --- Settlement mode (escrow vs p2p) -----------------------------------------
// How a hire payment settles. "escrow" (default) keeps the current custodial
// flow: the buyer funds a Talse-managed escrow and the platform releases funds
// to the provider via A2U (Testnet today). "p2p" is the Production (Mainnet)
// strategy: the buyer pays the provider directly (Pioneer-to-Pioneer, allowed
// on Mainnet) and the platform takes a U2A fee. P2P is only honoured on a
// non-sandbox (Production) build — on Sandbox/Testnet it would strand funds.
export type PiSettlementMode = "escrow" | "p2p";

export function getSettlementMode(): PiSettlementMode {
  if (getPiSandboxMode()) return "escrow";
  const mode = process.env.PI_SETTLEMENT_MODE ?? "escrow";
  return mode === "p2p" ? "p2p" : "escrow";
}

/**
 * Single resolved view of the network this build runs on. Server helpers should
 * read this instead of re-deriving envs, so Testnet and Mainnet deployments
 * cannot silently drift apart. Values are resolved once at module load.
 */
export const PI_NETWORK = {
  name: getPiSandboxMode() ? "testnet" : "mainnet",
  sandbox: getPiSandboxMode(),
  settlementMode: getSettlementMode(),
  platformApiBase: PI_PLATFORM_API_BASE,
  passphrase: PI_NETWORK_PASSPHRASE,
  horizonUrl: PI_HORIZON_URL,
  rpcUrl: PI_RPC_URL,
} as const;

if (process.env.NODE_ENV !== "production") {
  // Safe diagnostic log: environment + base URL only, never the API key.
  console.info("[PiEnv]", {
    environment: PI_ENV_NAME,
    platformApiBase: PI_PLATFORM_API_BASE,
    testnetBlockchainApiBase: PI_TESTNET_BLOCKCHAIN_API_BASE,
    apiKeyConfigured: PI_API_KEY_CONFIGURED,
    sandbox: getPiSandboxMode(),
  });

  // NEXT_PUBLIC_PI_SANDBOX is the flag the browser can see; PI_ENV is
  // server-only. If they disagree the client and server can pick different
  // networks, so warn instead of silently mixing Test/Mainnet context.
  if (
    sandboxOverride !== undefined &&
    explicitEnv !== undefined &&
    (sandboxOverride === "true") !== (explicitEnv === "sandbox")
  ) {
    console.warn(
      `[PiEnv] NEXT_PUBLIC_PI_SANDBOX="${sandboxOverride}" disagrees with PI_ENV="${explicitEnv}". Set both consistently — the public flag wins.`,
    );
  }
}
