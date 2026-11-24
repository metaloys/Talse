"use client";

// Shared types for the console screens.

export type SectionId =
  | "overview"
  | "live"
  | "orders"
  | "escrow"
  | "payments"
  | "offers"
  | "listings"
  | "categories"
  | "boosts"
  | "users"
  | "providers"
  | "reviews"
  | "reports"
  | "disputes"
  | "conversations"
  | "trust"
  | "revenue"
  | "fees"
  | "analytics"
  | "exports"
  | "audit"
  | "admins"
  | "configuration"
  | "health";

export type Notify = (message: string, tone?: "success" | "danger" | "info") => void;

export type ScreenCtx = {
  token: string;
  notify: Notify;
  openOrder: (id: string) => void;
  openUser: (uid: string) => void;
  go: (section: SectionId) => void;
  role: string;
};
