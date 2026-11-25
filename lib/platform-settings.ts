// Platform configuration the admin console displays *and edits*.
//
// Before this, the fee percentage came from an env var, the boost price from a
// constant, and nothing could be changed without a redeploy. Values now live in
// `platform_settings` (migration 011) and are read through here, with the old
// env vars / constants kept as defaults so an empty table behaves exactly as
// before.
//
// Reads are cached briefly (15s) because the payout path reads the fee on every
// release; a short TTL means an admin's change takes effect quickly without
// turning every payout into an extra query.

import { supabaseAdmin } from "@/lib/supabase-server";

export type PlatformSettings = {
  platform_fee_percent: number;
  network_fee_pi: number;
  boost_price_pi: number;
  boost_duration_days: number;
  max_listing_images: number;
  max_image_upload_mb: number;
  dispute_sla_hours: number;
  maintenance_mode: boolean;
  feature_offers_enabled: boolean;
  feature_boosts_enabled: boolean;
  feature_analytics_enabled: boolean;
  /** USD per 1 Pi, used only for revenue reporting. An assumption, not a quote. */
  pi_usd_rate: number;
};

export const SETTING_KEYS = [
  "platform_fee_percent",
  "network_fee_pi",
  "boost_price_pi",
  "boost_duration_days",
  "max_listing_images",
  "max_image_upload_mb",
  "dispute_sla_hours",
  "maintenance_mode",
  "feature_offers_enabled",
  "feature_boosts_enabled",
  "feature_analytics_enabled",
  "pi_usd_rate",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export const PLATFORM_SETTING_DEFAULTS: PlatformSettings = {
  platform_fee_percent: 0.1,
  network_fee_pi: 0.01,
  boost_price_pi: 5,
  boost_duration_days: 7,
  max_listing_images: 4,
  max_image_upload_mb: 12,
  dispute_sla_hours: 48,
  maintenance_mode: false,
  feature_offers_enabled: true,
  feature_boosts_enabled: true,
  feature_analytics_enabled: true,
  // Placeholder reporting assumption. Update to the current rate from
  // Configuration; projections recompute from whatever is stored here.
  pi_usd_rate: 0.3,
};

/** Human-facing metadata for the Configuration screen. */
export const SETTING_META: Record<
  SettingKey,
  { label: string; hint: string; kind: "percent" | "pi" | "usd" | "number" | "bool" }
> = {
  platform_fee_percent: { label: "Platform fee", hint: "Retained from each released job", kind: "percent" },
  network_fee_pi: { label: "Network fee absorbed", hint: "Pi absorbed per outgoing payout", kind: "pi" },
  boost_price_pi: { label: "Boost price", hint: "Charged for a featured listing", kind: "pi" },
  boost_duration_days: { label: "Boost duration", hint: "Days a boost stays active", kind: "number" },
  max_listing_images: { label: "Max listing images", hint: "Per listing", kind: "number" },
  max_image_upload_mb: { label: "Max upload size", hint: "Per portfolio image", kind: "number" },
  dispute_sla_hours: { label: "Dispute SLA", hint: "Target hours to first response", kind: "number" },
  maintenance_mode: { label: "Maintenance mode", hint: "Show a maintenance notice to users", kind: "bool" },
  feature_offers_enabled: { label: "Offers", hint: "Counter-offers on hire requests", kind: "bool" },
  feature_boosts_enabled: { label: "Boosts", hint: "Featured listing boosts", kind: "bool" },
  feature_analytics_enabled: { label: "Analytics", hint: "Product event collection", kind: "bool" },
  pi_usd_rate: {
    label: "Pi price (USD)",
    hint: "Reporting assumption for USD projections — not a live quote",
    kind: "usd",
  },
};

const TTL_MS = 15_000;
let cache: { at: number; value: PlatformSettings } | null = null;

function coerce(key: SettingKey, raw: unknown): unknown {
  const fallback = PLATFORM_SETTING_DEFAULTS[key];
  if (raw === null || raw === undefined) return fallback;
  if (typeof fallback === "boolean") return raw === true || raw === "true";
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** All settings, with defaults filled in for anything missing. */
export async function getPlatformSettings(force = false): Promise<PlatformSettings> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;

  const value: PlatformSettings = { ...PLATFORM_SETTING_DEFAULTS };
  try {
    const { data, error } = await supabaseAdmin.from("platform_settings").select("key, value");
    if (error) throw error;
    for (const row of data ?? []) {
      if ((SETTING_KEYS as readonly string[]).includes(row.key)) {
        (value as Record<string, unknown>)[row.key] = coerce(row.key as SettingKey, row.value);
      }
    }
  } catch (err) {
    // A missing table (pre-migration) or transient DB error must not break the
    // payout path — fall back to defaults.
    console.error("[platform-settings] falling back to defaults:", err instanceof Error ? err.message : err);
  }

  cache = { at: Date.now(), value };
  return value;
}

export async function getPlatformFeePercentAsync(): Promise<number> {
  return (await getPlatformSettings()).platform_fee_percent;
}

export async function getBoostPricePi(): Promise<number> {
  return (await getPlatformSettings()).boost_price_pi;
}

export async function getBoostDurationDays(): Promise<number> {
  return (await getPlatformSettings()).boost_duration_days;
}

/**
 * Writes one setting and appends to `platform_settings_history`. Returns the
 * new full settings object. Cache is invalidated so the change is live.
 */
export async function updatePlatformSetting(
  key: SettingKey,
  value: unknown,
  actorUid: string,
): Promise<PlatformSettings> {
  const current = await getPlatformSettings(true);
  const previous = (current as Record<string, unknown>)[key];
  const next = coerce(key, value);

  const { error } = await supabaseAdmin
    .from("platform_settings")
    .upsert({ key, value: next, updated_at: new Date().toISOString(), updated_by: actorUid }, { onConflict: "key" });
  if (error) throw error;

  await supabaseAdmin.from("platform_settings_history").insert({
    key,
    previous_value: previous ?? null,
    new_value: next,
    changed_by: actorUid,
  });

  cache = null;
  return getPlatformSettings(true);
}

export async function getSettingsHistory(limit = 50) {
  const { data, error } = await supabaseAdmin
    .from("platform_settings_history")
    .select("*")
    .order("changed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
