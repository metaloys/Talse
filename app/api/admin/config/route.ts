import { NextRequest, NextResponse } from "next/server";
import {
  getPlatformSettings,
  updatePlatformSetting,
  getSettingsHistory,
  SETTING_KEYS,
  SETTING_META,
  type SettingKey,
} from "@/lib/platform-settings";
import { authorizeAdmin, adminError, writeAudit } from "@/lib/admin-route";

// GET  /api/admin/config — current platform settings, their metadata and the
//                          recent change history.
// PUT  /api/admin/config — update one setting: { key, value }.
//
// Owner-only. Every change is recorded in `platform_settings_history` and the
// admin audit log, so "who lowered the fee and when" is answerable. The fee
// change is picked up by the payout path within the 15s settings cache TTL.

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "configuration");
    const [settings, history] = await Promise.all([getPlatformSettings(true), getSettingsHistory(50)]);
    return NextResponse.json({ settings, meta: SETTING_META, keys: SETTING_KEYS, history });
  } catch (err) {
    return adminError(err, "config");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const access = await authorizeAdmin(req, "configuration");

    const body = await req.json().catch(() => ({}));
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const key = body.key as SettingKey;
    if (!SETTING_KEYS.includes(key)) {
      return NextResponse.json({ error: "Unknown setting key" }, { status: 400 });
    }
    if (body.value === undefined) {
      return NextResponse.json({ error: "value is required" }, { status: 400 });
    }

    const before = await getPlatformSettings(true);
    const settings = await updatePlatformSetting(key, body.value, access.uid);
    const after = (settings as Record<string, unknown>)[key];

    await writeAudit({
      adminUid: access.uid,
      action: "settings.update",
      targetType: "settings",
      targetId: key,
      previousState: { [key]: (before as Record<string, unknown>)[key] },
      newState: { [key]: after },
    });

    return NextResponse.json({ ok: true, key, value: after, settings });
  } catch (err) {
    return adminError(err, "config");
  }
}
