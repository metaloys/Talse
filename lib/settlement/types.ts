import type { PiSettlementMode } from "@/lib/pi-env";

/**
 * Money-out strategy for a hire request. One implementation per mode; the
 * active mode comes from getSettlementMode() (lib/pi-env.ts).
 *
 * This is the "CONTRACT SEAM" anticipated by lib/dispute-resolution.ts —
 * swap or extend the settlement implementation here without touching callers.
 */
export interface Settlement {
  readonly mode: PiSettlementMode;

  /**
   * Release the (escrowed or directly-paid) funds toward `favor`.
   * Escrow mode delegates to the existing custodial A2U payout path; p2p mode
   * records a direct Pioneer-to-Pioneer payment.
   */
  release(params: { hireRequestId: string; favor: "provider" | "buyer" }): Promise<unknown>;
}