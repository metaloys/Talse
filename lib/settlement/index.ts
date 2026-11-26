import { getSettlementMode } from "@/lib/pi-env";
import type { Settlement } from "@/lib/settlement/types";
import { escrowSettlement } from "@/lib/settlement/escrow";
import { p2pSettlement } from "@/lib/settlement/p2p";

export { SettlementNotSupportedError } from "@/lib/settlement/p2p";
export type { Settlement } from "@/lib/settlement/types";

let cached: Settlement | undefined;

/**
 * Returns the active Settlement implementation for this build, resolving the
 * mode once (getSettlementMode is itself resolved at module load).
 */
export function getSettlement(): Settlement {
  const mode = getSettlementMode();
  if (!cached || cached.mode !== mode) {
    cached = mode === "p2p" ? p2pSettlement : escrowSettlement;
  }
  return cached;
}