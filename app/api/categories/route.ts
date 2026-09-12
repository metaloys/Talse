import { NextResponse } from "next/server";
import { CATEGORIES } from "@/lib/services/data";
import { supabaseAdmin } from "@/lib/supabase-server";

// Public GET /api/categories — returns active categories sorted by sort_order.
// If the database is unavailable or empty, fall back to the app's built-in
// category set so the customer-facing UI never hangs on a loading spinner.
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin.from("categories").select("*").eq("active", true).order("sort_order", { ascending: true });
    if (error || !data || data.length === 0) {
      return NextResponse.json({ categories: CATEGORIES.map((category, index) => ({ ...category, active: true, sort_order: index + 1 })) });
    }
    return NextResponse.json({ categories: data ?? [] });
  } catch {
    return NextResponse.json({ categories: CATEGORIES.map((category, index) => ({ ...category, active: true, sort_order: index + 1 })) });
  }
}
