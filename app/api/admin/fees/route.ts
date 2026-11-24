import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin, adminError } from "@/lib/admin-route";
import { getPlatformFeePercent } from "@/lib/fee-config";

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "fees");
    const fee = await getPlatformFeePercent();
    return NextResponse.json({ fee });
  } catch (err) {
    return adminError(err, "fees");
  }
}
