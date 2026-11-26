import type { Settlement } from "@/lib/settlement/types";

/**
 * Thrown when a settlement action is attempted in a mode that does not support
 * it. Phase M2 implements the P2P release path; until then a Production build
 * pinning PI_SETTLEMENT_MODE=p2p fails loudly instead of silently pretending
 * funds moved.
 */
export class SettlementNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementNotSupportedError";
  }
}

/**
 * P2P settlement (Production/Mainnet strategy): the buyer pays the provider
 * directly — Pioneer-to-Pioneer transfers are explicitly allowed on Mainnet —
 * and the platform takes its fee via U2A. No A2U needed, so no custodial
 * wallet. Wired up in Phase M2; keeps the seam honest until then.
 */
export const p2pSettlement: Settlement = {
  mode: "p2p",
  async release({ hireRequestId }) {
    throw new SettlementNotSupportedError(
      `P2P settlement for hire request ${hireRequestId} is not wired up yet (Phase M2).`,
    );
  },
};