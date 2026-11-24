import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeAdmin, adminError } from "@/lib/admin-route";

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "reviews");

    const { data, error } = await supabaseAdmin
      .from("reviews")
      .select("*, provider:profiles!reviews_provider_uid_fkey(username), reviewer:profiles!reviews_reviewer_uid_fkey(username)")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ reviews: data ?? [] });
  } catch (err) {
    return adminError(err, "reviews");
  }
}
