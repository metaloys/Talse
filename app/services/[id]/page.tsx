import React from "react";
import type { Metadata } from "next";
import { ServicesApp } from "@/components/services/services-app";
import { supabaseAdmin } from "@/lib/supabase-server";

// Share target for a listing: /services/[id]
//
// The metadata makes the link render properly in chat previews (which is what
// most shares turn into); the page itself hands the id to the app, which
// resolves the listing even when it is not in the loaded catalogue page.
async function loadListing(id: string) {
  try {
    const { data } = await supabaseAdmin
      .from("services")
      .select("title, description, profiles!services_owner_uid_fkey(display_name, username)")
      .eq("id", id)
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const listing = await loadListing(id);
  if (!listing) return { title: "Listing · Talse" };

  const owner = Array.isArray(listing.profiles) ? listing.profiles[0] : listing.profiles;
  const provider = owner?.display_name || owner?.username;
  const description = (listing.description ?? "").replace(/\s+/g, " ").trim().slice(0, 160);

  return {
    title: `${listing.title} · Talse`,
    description: provider ? `${listing.title} by ${provider} on Talse — hire Pi builders with Pi.` : description,
    openGraph: {
      title: `${listing.title} · Talse`,
      description: description || "Hire Pi builders with Pi on Talse.",
      type: "website",
    },
  };
}

export default async function ServiceDeepLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ServicesApp initialDeepLink={{ type: "service", id }} />;
}