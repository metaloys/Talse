import type { Settlement } from "@/lib/settlement/types";
import { payoutHireRequest } from "@/lib/dispute-resolution";

/**
 * Custodial escrow settlement (current default, Testnet/Sandbox).
 *
 * Delegates straight to the existing payout path — A2U create/sign/submit via
 * lib/dispute-resolution.ts. Behaviour is intentionally unchanged; this wrapper
 * only routes the call through the Settlement seam.
 */
export const escrowSettlement: Settlement = {
  mode: "escrow",
  async release(params) {
    return payoutHireRequest(params);
  },
};