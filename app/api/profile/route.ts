import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { sanitizeProfile, profileToBlob } from "@/lib/services/data";

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const me = await verifyPiToken(auth);

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("pi_uid, username, display_name, bio, location, created_at")
      .eq("pi_uid", me.uid)
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116: no rows found — treat as empty
      console.error("[GET /api/profile] supabase error:", error);
    }

    if (!data) {
      return NextResponse.json(sanitizeProfile({}), { status: 200 });
    }

    const out = sanitizeProfile({
      piId: data.pi_uid,
      name: data.display_name || data.username || "",
      bio: data.bio || "",
      location: data.location || "",
      joinedAt: data.created_at ? new Date(data.created_at).getTime() : 0,
    });

    return NextResponse.json(out);
  } catch (err) {
    if (err instanceof PiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/profile] unexpected:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const me = await verifyPiToken(auth);
    const body = await req.json();

    // Build a partial profile object and sanitize using existing logic.
    const sanitized = sanitizeProfile({
      piId: me.uid,
      name: body.name,
      bio: body.bio,
      location: body.location,
      joinedAt: body.joinedAt || Date.now(),
    });

    // Upsert into profiles. Map to existing schema columns.
    const upsertRow: any = {
      pi_uid: me.uid,
      username: me.username || null,
      display_name: sanitized.name || null,
      bio: sanitized.bio || null,
      location: sanitized.location || null,
    };

    const { error } = await supabaseAdmin.from("profiles").upsert(upsertRow, { onConflict: "pi_uid" });
    if (error) {
      console.error("[PATCH /api/profile] supabase upsert error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json(sanitizeProfile({ ...upsertRow, joinedAt: sanitized.joinedAt }));
  } catch (err) {
    if (err instanceof PiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[PATCH /api/profile] unexpected:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
