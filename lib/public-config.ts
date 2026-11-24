"use client";

// Client accessor for /api/config — the public-safe runtime configuration the
// admin console can change (boost price/duration, fee, limits, feature flags).
//
// Falls back to the compile-time constants in lib/boost-config.ts so the UI is
// correct even if the request fails. Fetched once per page load and shared.

import { useEffect, useState } from "react";
import { BOOST_DURATION_DAYS, BOOST_MEMO, BOOST_PRICE_PI } from "@/lib/boost-config";

export type PublicConfig = {
  boostPricePi: number;
  boostDurationDays: number;
  boostMemo: string;
  platformFeePercent: number;
  maxListingImages: number;
  maxImageUploadMb: number;
  maintenanceMode: boolean;
  features: { offers: boolean; boosts: boolean; analytics: boolean };
};

export const PUBLIC_CONFIG_FALLBACK: PublicConfig = {
  boostPricePi: BOOST_PRICE_PI,
  boostDurationDays: BOOST_DURATION_DAYS,
  boostMemo: BOOST_MEMO,
  platformFeePercent: 0.1,
  maxListingImages: 4,
  maxImageUploadMb: 12,
  maintenanceMode: false,
  features: { offers: true, boosts: true, analytics: true },
};

let cache: PublicConfig | null = null;
let inflight: Promise<PublicConfig> | null = null;

export async function loadPublicConfig(): Promise<PublicConfig> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch("/api/config")
    .then((res) => (res.ok ? res.json() : null))
    .then((data: Partial<PublicConfig> | null) => {
      cache = { ...PUBLIC_CONFIG_FALLBACK, ...(data ?? {}) };
      return cache;
    })
    .catch(() => {
      cache = PUBLIC_CONFIG_FALLBACK;
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Synchronous read of whatever has been loaded so far (fallback before load). */
export function getPublicConfig(): PublicConfig {
  return cache ?? PUBLIC_CONFIG_FALLBACK;
}

export function usePublicConfig(): PublicConfig {
  const [config, setConfig] = useState<PublicConfig>(() => getPublicConfig());
  useEffect(() => {
    let mounted = true;
    loadPublicConfig().then((c) => {
      if (mounted) setConfig(c);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return config;
}
