export function getPlatformFeePercent(): number {
  // Read from env var PLATFORM_FEE_PERCENT (e.g. "0.10" for 10%)
  const raw = process.env.PLATFORM_FEE_PERCENT;
  if (!raw) return 0.1; // default 10%
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0 || n > 1) return 0.1;
  return n;
}

export function formatPi(n: number): number {
  // Round to 2 decimal places for storage/display
  return Math.round(n * 100) / 100;
}

// Network fee the platform absorbs when its wallet sends an outgoing payout.
// Recorded on the earnings ledger so "money in" and "money out" stay separate.
export const PLATFORM_NETWORK_FEE_PI = 0.01;
