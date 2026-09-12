export function getFrontendPlatformFeePercent(): number {
  const raw = process.env.NEXT_PUBLIC_PLATFORM_FEE_PERCENT;
  if (!raw) return 0.1;
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0 || n > 1) return 0.1;
  return n;
}

export function calcPlatformFee(gross: number, percent: number): number {
  return Math.round(gross * percent * 100) / 100;
}

export const BLOCKCHAIN_GAS_DISPLAY = "0.01 Pi";
export const BLOCKCHAIN_GAS_LABEL = "Blockchain fee: 0.01 Pi — Covered by Platform";
