import { NextResponse } from "next/server";
import { getPlatformSettings } from "@/lib/platform-settings";
import { BOOST_MEMO } from "@/lib/boost-config";

// GET /api/config — public, unauthenticated runtime configuration.
//
// The admin console can change the boost price, duration and platform fee. The
// browser needs those values to build a Pi payment and to show the right price,
// so the public-safe subset is exposed here (no uids, no secrets). Values are
// cached edge-side briefly so this never becomes a hot path.
export const revalidate = 30;

export async function GET() {
  const s = await getPlatformSettings();
  return NextResponse.json(
    {
      boostPricePi: s.boost_price_pi,
      boostDurationDays: s.boost_duration_days,
      boostMemo: BOOST_MEMO,
      platformFeePercent: s.platform_fee_percent,
      maxListingImages: s.max_listing_images,
      maxImageUploadMb: s.max_image_upload_mb,
      maintenanceMode: s.maintenance_mode,
      features: {
        offers: s.feature_offers_enabled,
        boosts: s.feature_boosts_enabled,
        analytics: s.feature_analytics_enabled,
      },
    },
    { headers: { "cache-control": "public, max-age=0, s-maxage=30, stale-while-revalidate=120" } },
  );
}
