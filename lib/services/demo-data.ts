export type DemoStatus = "active" | "pending" | "complete" | "empty" | "error";

export interface DemoJob {
  id: string;
  requestId: string;
  title: string;
  role: "customer" | "provider";
  status: "Not started" | "In progress" | "Delivered";
  due: string;
  amount: number;
  ownedByMe: boolean;
}

export interface DemoMessage {
  id: string;
  requestId: string;
  name: string;
  preview: string;
  unread: boolean;
  updated: string;
}

export interface DemoReview {
  id: string;
  name: string;
  service: string;
  rating: number;
  text: string;
  mine: boolean;
}

export interface DemoPayment {
  id: string;
  label: string;
  amount: number;
  status: "Not enabled" | "Recorded";
  note: string;
}

// Frontend-only fixtures. Replace this module with backend responses later.
export const DEMO_JOBS: DemoJob[] = [
  { id: "job-demo-1", requestId: "req-demo-1", title: "Brand refresh handoff", role: "provider", status: "In progress", due: "Sep 12", amount: 45, ownedByMe: true },
  { id: "job-demo-2", requestId: "req-demo-2", title: "Website review", role: "customer", status: "Not started", due: "Sep 18", amount: 30, ownedByMe: false },
];

export const DEMO_MESSAGES: DemoMessage[] = [
  { id: "msg-demo-1", requestId: "req-demo-1", name: "Aurora Vale", preview: "I’ll share the first draft tomorrow.", unread: true, updated: "12m ago" },
  { id: "msg-demo-2", requestId: "req-demo-2", name: "Kato Mensah", preview: "Thanks, I’ve received your brief.", unread: false, updated: "Yesterday" },
];

export const DEMO_REVIEWS: DemoReview[] = [
  { id: "review-demo-1", name: "Nadia P.", service: "Logo & brand mark design", rating: 5, text: "Clear communication and a thoughtful result.", mine: false },
  { id: "review-demo-2", name: "You", service: "Website review", rating: 0, text: "Your review will appear here after delivery.", mine: true },
];

export const DEMO_PAYMENTS: DemoPayment[] = [
  { id: "payment-demo-1", label: "Brand refresh handoff", amount: 45, status: "Not enabled", note: "Payment records will appear when official Pi payments are enabled." },
];

export const DEMO_REPUTATION = {
  score: "New profile",
  completed: 0,
  rating: "Not rated yet",
  note: "Reputation is based on completed work and verified reviews. No trust or KYC guarantee is implied.",
};

export const DEMO_DELAY_MS = 450;
