import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin, adminError } from "@/lib/admin-route";
import { allowedSections } from "@/lib/admin";

// GET /api/admin/me — the signed-in admin's identity, role and the console
// sections that role may open. The console shell calls this once to hide or
// show navigation; every route enforces the same rules server-side, so a forged
// section id cannot bypass anything.

export async function GET(req: NextRequest) {
  try {
    const access = await authorizeAdmin(req);
    return NextResponse.json({
      uid: access.uid,
      role: access.role,
      source: access.source,
      sections: allowedSections(access.role),
    });
  } catch (err) {
    return adminError(err, "me");
  }
}
