import React from "react";
import { ServicesApp } from "@/components/services/services-app";

export default async function HireRequestDeepLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ServicesApp initialDeepLink={{ type: "hire-request", id }} />;
}
