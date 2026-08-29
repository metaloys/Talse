export type AdminTab = "dashboard" | "users" | "services" | "jobs" | "requests" | "reviews" | "payments" | "fees" | "reports" | "categories" | "settings";

export const ADMIN_TABS: Array<{ id: AdminTab; label: string; hint: string }> = [
  { id: "dashboard", label: "Dashboard", hint: "Platform overview" },
  { id: "users", label: "Users", hint: "Accounts and access" },
  { id: "services", label: "Services", hint: "Listings review" },
  { id: "jobs", label: "Jobs", hint: "Work in progress" },
  { id: "requests", label: "Requests", hint: "Hire requests" },
  { id: "reviews", label: "Reviews", hint: "Trust and feedback" },
  { id: "payments", label: "Payments", hint: "Future integration" },
  { id: "fees", label: "Fees", hint: "Platform policy" },
  { id: "reports", label: "Reports", hint: "Moderation queue" },
  { id: "categories", label: "Categories", hint: "Service taxonomy" },
  { id: "settings", label: "Settings", hint: "Admin preferences" },
];

export const ADMIN_METRICS = [
  ["Users", "1,284", "↑ 8.4% this month"], ["Active services", "326", "24 awaiting review"],
  ["Open requests", "87", "12 need attention"], ["Jobs", "154", "91 currently active"],
] as const;

export const ADMIN_QUEUES = [
  { title: "Services awaiting review", value: "24", tone: "warning" },
  { title: "Reported content", value: "6", tone: "danger" },
  { title: "Payment integration", value: "Not enabled", tone: "neutral" },
  { title: "New categories", value: "3", tone: "primary" },
] as const;

export const ADMIN_ROWS: Record<Exclude<AdminTab, "dashboard" | "settings">, Array<{ id: string; title: string; detail: string; status: string }>> = {
  users: [{ id: "usr_demo_001", title: "Amina K.", detail: "Provider · 12 services", status: "Active" }, { id: "usr_demo_002", title: "Daniel M.", detail: "Customer · 3 requests", status: "Active" }],
  services: [{ id: "svc_demo_001", title: "Brand identity design", detail: "creative · 18 π", status: "Pending review" }, { id: "svc_demo_002", title: "Website accessibility audit", detail: "technology · 25 π", status: "Published" }],
  jobs: [{ id: "job_demo_001", title: "Brand identity design", detail: "customer → provider", status: "In progress" }, { id: "job_demo_002", title: "Translation support", detail: "provider → customer", status: "Completed" }],
  requests: [{ id: "req_demo_001", title: "Brand identity design", detail: "customer requested · 4 days", status: "Pending" }, { id: "req_demo_002", title: "Accessibility audit", detail: "provider responded", status: "Accepted" }],
  reviews: [{ id: "rev_demo_001", title: "4.8 rating", detail: "job_demo_001 · reviewer demo", status: "Published" }, { id: "rev_demo_002", title: "Review awaiting moderation", detail: "job_demo_002", status: "Pending" }],
  payments: [{ id: "pay_demo_001", title: "Payment placeholder", detail: "job_demo_001 · future reference", status: "Unavailable" }],
  fees: [{ id: "fee_demo_001", title: "Platform fee policy", detail: "No fee collection enabled", status: "Draft" }],
  reports: [{ id: "rpt_demo_001", title: "Listing report", detail: "svc_demo_001 · demo report", status: "Open" }],
  categories: [{ id: "cat_demo_001", title: "Creative", detail: "42 services", status: "Enabled" }, { id: "cat_demo_002", title: "Technology", detail: "68 services", status: "Enabled" }],
};

export const ADMIN_NOTICE = "Admin data shown here is frontend demo data only. It is not shared, persistent, or connected to platform records.";
