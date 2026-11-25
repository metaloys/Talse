import React from "react";
import { ServicesApp } from "@/components/services/services-app";

// Deep link for a conversation: /messages/[hireRequestId]
//
// Used by in-app notifications and by Pi's Notification Center so tapping
// "New message" opens the thread itself rather than the request card.
export default async function MessageDeepLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ServicesApp initialDeepLink={{ type: "message", id }} />;
}