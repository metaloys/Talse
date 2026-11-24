import React from "react";
import type { Metadata } from "next";
import { ServicesApp } from "@/components/services/services-app";
import { supabaseAdmin } from "@/lib/supabase-server";

// Share target for a provider: /providers/[id]
//
// The app fetches the public profile + their listings on demand, so a shared
// profile opens even on a device that has never seen this provider before.
async function loadProvider(id: string) {
  try {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("username, display_name, bio")
      .eq("pi_uid", id)
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const profile = await loadProvider(id);
  const name = profile?.display_name || profile?.username || "Provider";
  const bio = (profile?.bio ?? "").replace(/\s+/g, " ").trim().slice(0, 160);

  return {
    title: `${name} · Talse`,
    description: bio || `See ${name}'s services and reviews on Talse — hire Pi builders with Pi.`,
    openGraph: {
      title: `${name} · Talse`,
      description: bio || "Hire Pi builders with Pi on Talse.",
      type: "profile",
    },
  };
}

export default async function ProviderDeepLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ServicesApp initialDeepLink={{ type: "provider", id }} />;
}