"use client";

// Thin client for the backend built in app/api/*. Every write call needs the
// real Pi accessToken from usePiAuth() (NOT the @swetate session) — pass it
// in explicitly rather than reading context here, so this file has no
// framework/context dependency and stays easy to test.

const BASE = ""; // same-origin: these routes live in this Next.js app under app/api/*

async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; accessToken?: string | null } = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.accessToken ? { Authorization: `Bearer ${opts.accessToken}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed: ${res.status}`);
  }
  return data as T;
}

// ---- services ----
export const backendApi = {
  services: {
    list: (params?: { category?: string; q?: string; owner?: string; page?: number; perPage?: number }) => {
      const qs = params
        ? new URLSearchParams(
            Object.fromEntries(
              Object.entries(params as Record<string, unknown>)
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => [k, String(v)])
            )
          ).toString()
        : "";
      return request<{ services: any[] } | { services: any[]; page: number; perPage: number; total: number; hasMore: boolean }>(`/api/services${qs ? `?${qs}` : ""}`);
    },
    get: (id: string) => request<{ service: any }>(`/api/services/${id}`),
    create: (body: { title: string; category: string; description: string; price: number; deliveryId: string; images?: string[]; coverImage?: string }, accessToken: string) =>
      request<{ service: any }>(`/api/services`, { method: "POST", body, accessToken }),
    update: (id: string, body: Record<string, unknown>, accessToken: string) =>
      request<{ service: any }>(`/api/services/${id}`, { method: "PATCH", body, accessToken }),
    remove: (id: string, accessToken: string) =>
      request<{ ok: true }>(`/api/services/${id}`, { method: "DELETE", accessToken }),
    confirmBoost: (id: string, paymentId: string, txid: string, accessToken: string) =>
      request<{ boostedUntil: string }>(`/api/services/${id}/boost`, {
        method: "POST",
        body: { paymentId, txid },
        accessToken,
      }),
  },
  categories: {
    // Public categories for discovery/create-service UI
    listPublic: () => request<{ categories: any[] }>(`/api/categories`),
  },

  hireRequests: {
    listMine: (role: "incoming" | "outgoing", accessToken: string, params?: { page?: number; perPage?: number }) => {
      const qs = params
        ? new URLSearchParams(
            Object.fromEntries(
              Object.entries(params as Record<string, unknown>)
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => [k, String(v)])
            )
          ).toString()
        : "";
      return request<{ requests: any[] } | { requests: any[]; page: number; perPage: number; total: number; hasMore: boolean }>(`/api/hire-requests?role=${role}${qs ? `&${qs}` : ""}`, { accessToken });
    },
    get: (id: string, accessToken: string) =>
      request<{ request: any }>(`/api/hire-requests/${id}`, { accessToken }),
    create: (body: { serviceId: string; message: string; deadline?: string; attachments?: string[] }, accessToken: string) =>
      request<{ request: any }>(`/api/hire-requests`, { method: "POST", body, accessToken }),
    setStatus: (id: string, status: string, accessToken: string) =>
      request<{ request: any }>(`/api/hire-requests/${id}`, { method: "PATCH", body: { status }, accessToken }),
    fileDispute: (
      id: string,
      body: { reason: string; details?: string; evidence?: string[] },
      accessToken: string
    ) =>
      request<{ request: any }>(`/api/hire-requests/${id}`, {
        method: "PATCH",
        body: { status: "disputed", ...body },
        accessToken,
      }),
    release: (id: string, accessToken: string) =>
      request<{ request: any }>(`/api/hire-requests/${id}/release`, { method: "POST", accessToken }),
    refund: (id: string, accessToken: string) =>
      request<{ request: any }>(`/api/hire-requests/${id}/refund`, { method: "POST", accessToken }),
    makeOffer: (id: string, body: { amount: number; message?: string }, accessToken: string) =>
      request<{ offer: any }>(`/api/hire-requests/${id}/offers`, { method: "POST", body, accessToken }),
    respondToOffer: (id: string, body: { offerId: string; accept: boolean }, accessToken: string) =>
      request<{ offer: any; request: any }>(`/api/hire-requests/${id}/offers/respond`, { method: "POST", body, accessToken }),
  },

  payments: {
    approve: (paymentId: string, hireRequestId: string, accessToken: string) =>
      request<{ ok: true }>(`/api/payments/approve`, { method: "POST", body: { paymentId, hireRequestId }, accessToken }),
    complete: (paymentId: string, txid: string, hireRequestId: string, accessToken: string) =>
      request<{ request: any }>(`/api/payments/complete`, { method: "POST", body: { paymentId, txid, hireRequestId }, accessToken }),
    recover: (paymentId: string, accessToken: string) =>
      request<{ status: string }>(`/api/payments/recover`, { method: "POST", body: { paymentId }, accessToken }),
    listIncomplete: (accessToken: string) =>
      request<{ incomplete: any[] }>(`/api/payments/incomplete`, { accessToken }),
  },

  messages: {
    list: (hireRequestId: string, accessToken: string, params?: { before?: string; limit?: number }) => {
      const qs = params
        ? new URLSearchParams(
            Object.fromEntries(
              Object.entries(params as Record<string, unknown>)
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => [k, String(v)])
            )
          ).toString()
        : "";
      return request<{ messages: any[]; hasMore?: boolean }>(`/api/messages?hireRequestId=${hireRequestId}${qs ? `&${qs}` : ""}`, { accessToken });
    },
    // include optional attachments array in the POST body (paths returned by the
    // existing upload endpoint). Call sites already pass this fourth arg.
    send: (hireRequestId: string, text: string, accessToken: string, attachments?: string[]) =>
      request<{ message: any }>(`/api/messages`, { method: "POST", body: { hireRequestId, text, attachments }, accessToken }),
  },

  notifications: {
    list: (accessToken: string, params?: { limit?: number }) => {
      const qs = params?.limit ? `?limit=${params.limit}` : "";
      return request<{ notifications: any[]; unread: number }>(`/api/notifications${qs}`, { accessToken });
    },
    markSeen: (accessToken: string, body: { ids?: string[]; all?: boolean }) =>
      request<{ ok: true }>(`/api/notifications`, { method: "POST", body, accessToken }),
  },

  reviews: {
    listForProvider: (providerUid: string, includeHidden = false) =>
      request<{ reviews: any[] }>(`/api/reviews?provider=${providerUid}${includeHidden ? "&includeHidden=true" : ""}`),
    create: (body: { hireRequestId: string; rating: number; text?: string }, accessToken: string) =>
      request<{ review: any }>(`/api/reviews`, { method: "POST", body, accessToken }),
  },

  me: {
    getAdminStatus: (accessToken: string) =>
      request<{ isAdmin: boolean }>(`/api/me/admin-status`, { accessToken }),
  },

  profile: {
    getFinancialSummary: (accessToken: string) =>
      request<{ totalSpent: number; lockedAsBuyer: number; owedToYou: number }>(`/api/profile/financial-summary`, { accessToken }),
  },

  admin: {
    listDisputes: (accessToken: string) =>
      request<{ disputes: any[] }>(`/api/admin/disputes`, { accessToken }),
    updateDispute: (id: string, body: { stage?: "investigating" | "escalated"; note?: string }, accessToken: string) =>
      request<{ request: any }>(`/api/admin/disputes/${id}`, { method: "PATCH", body, accessToken }),
    resolveDispute: (id: string, body: { favorProvider: boolean; note?: string }, accessToken: string) =>
      request<{ request: any }>(`/api/admin/disputes/${id}/resolve`, { method: "POST", body, accessToken }),
    dashboard: (accessToken: string) =>
      request<{ counts: any; earnings?: any; escrow?: any; series?: any[]; needsAttention?: any; generatedAt?: string }>(`/api/admin/dashboard`, { accessToken }),
    listUsers: (params?: { search?: string; page?: number; perPage?: number; filter?: string }, accessToken?: string) => {
      const qs = toQuery(params as AdminQuery | undefined);
      return request<{ users: any[]; page?: number; perPage?: number }>(`/api/admin/users${qs}`, { accessToken });
    },
    listServices: (params?: { search?: string }, accessToken?: string) => {
      const qs = params ? new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))).toString() : "";
      return request<{ services: any[] }>(`/api/admin/services${qs ? `?${qs}` : ""}`, { accessToken });
    },
    listRequests: (params?: { status?: string }, accessToken?: string) => {
      const qs = params ? new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))).toString() : "";
      return request<{ requests: any[] }>(`/api/admin/requests${qs ? `?${qs}` : ""}`, { accessToken });
    },
    listReviews: (accessToken?: string) => request<{ reviews: any[] }>(`/api/admin/reviews`, { accessToken }),
    listPayments: (accessToken?: string) => request<{ payments: any[] }>(`/api/admin/payments`, { accessToken }),
    getFees: (accessToken?: string) => request<{ fee: number }>(`/api/admin/fees`, { accessToken }),
    getSettings: (accessToken?: string) => request<{ adminUids: string[] }>(`/api/admin/settings`, { accessToken }),
    listReports: (params?: { status?: string; page?: number; perPage?: number }, accessToken?: string) => {
      const qs = params ? new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))).toString() : "";
      return request<{ reports: any[]; count?: number }>(`/api/admin/reports${qs ? `?${qs}` : ""}`, { accessToken });
    },
    listAuditEvents: (params?: { target_type?: string; action?: string; admin_uid?: string; range?: string; page?: number; perPage?: number }, accessToken?: string) => {
      const qs = toQuery(params as AdminQuery | undefined);
      return request<{ auditEvents: any[]; count?: number; page?: number; perPage?: number }>(`/api/admin/audit-events${qs}`, { accessToken });
    },
    updateReport: (id: string, body: { status?: string; admin_note?: string }, accessToken: string) =>
      request<{ report: any }>(`/api/admin/reports/${id}`, { method: "PATCH", body, accessToken }),
    listCategories: (accessToken?: string) => request<{ categories: any[] }>(`/api/admin/categories`, { accessToken }),
    createCategory: (body: { id: string; label: string; short: string; blurb: string; hue: number; active?: boolean; sort_order?: number }, accessToken: string) =>
      request<{ category: any }>(`/api/admin/categories`, { method: "POST", body, accessToken }),
    updateCategory: (id: string, body: Record<string, unknown>, accessToken: string) =>
      request<{ category: any }>(`/api/admin/categories/${id}`, { method: "PATCH", body, accessToken }),

    // ---- console (migration 011) ----
    // Every new console endpoint: reads are GET with query params, mutations
    // are POST/PATCH/PUT/DELETE and require the admin's Pi access token.
    me: (accessToken: string) =>
      request<{ uid: string; role: string; source: "env" | "table"; sections: string[] }>(`/api/admin/me`, { accessToken }),
    listOrders: (params: AdminQuery | undefined, accessToken: string) => {
      const qs = toQuery(params);
      return request<{ orders: any[]; count: number; page: number; perPage: number; statusCounts: Record<string, number> }>(
        `/api/admin/orders${qs}`, { accessToken });
    },
    getOrder: (id: string, accessToken: string) =>
      request<{ order: any; messages: any[]; offers: any[]; audit: any[] }>(`/api/admin/orders/${id}`, { accessToken }),
    listEscrow: (params: AdminQuery | undefined, accessToken: string) => {
      const qs = toQuery(params);
      return request<{ ledger: any[]; count: number; page: number; perPage: number; inFlight: { total: number; openJobs: number }; stuckPayouts: any[]; payoutSummary: { confirmed: number; pending: number; failed: number }; wallet: any }>(
        `/api/admin/escrow${qs}`, { accessToken });
    },
    reconcile: (hireRequestId: string, favor: "provider" | "buyer", accessToken: string) =>
      request<{ ok: boolean; action: string; request?: any; error?: string }>(
        `/api/admin/payments/${hireRequestId}/reconcile`, { method: "POST", body: { favor }, accessToken }),
    listBoosts: (params: AdminQuery | undefined, accessToken: string) => {
      const qs = toQuery(params);
      return request<{ boosts: any[]; count: number; page: number; perPage: number }>(`/api/admin/boosts${qs}`, { accessToken });
    },
    revokeBoost: (id: string, reason: string, accessToken: string) =>
      request<{ ok: true; boostedUntil: string }>(`/api/admin/boosts/${id}`, { method: "POST", body: { reason }, accessToken }),
    listOffers: (params: AdminQuery | undefined, accessToken: string) => {
      const qs = toQuery(params);
      return request<{ offers: any[]; count: number; page: number; perPage: number; statusCounts: Record<string, number> }>(
        `/api/admin/offers${qs}`, { accessToken });
    },
    listListings: (params: AdminQuery | undefined, accessToken: string) => {
      const qs = toQuery(params);
      return request<{ listings: any[]; count: number; page: number; perPage: number; boostedOnPage: number }>(
        `/api/admin/listings${qs}`, { accessToken });
    },
    setServiceActive: (id: string, active: boolean, reason: string, accessToken: string) =>
      request<{ active: boolean; auditLogged: boolean; serviceId: string }>(`/api/admin/services/${id}`, { method: "PATCH", body: { active, reason }, accessToken }),
    setReviewHidden: (id: string, hidden: boolean, reason: string, accessToken: string) =>
      request<{ reviewId: string; hidden: boolean; auditLogged: boolean }>(`/api/admin/reviews/${id}`, { method: "PATCH", body: { hidden, reason }, accessToken }),
    listConversations: (params: AdminQuery | undefined, accessToken: string) => {
      const qs = toQuery(params);
      return request<{ conversations: any[]; count: number; page: number; perPage: number }>(`/api/admin/conversations${qs}`, { accessToken });
    },
    analytics: (range: string, accessToken: string) =>
      request<{ range: string; totals: any; byName: Record<string, number>; series: any[]; funnel: any[]; topServices: any[] }>(
        `/api/admin/analytics?range=${range}`, { accessToken }),
    accounting: (range: string, accessToken: string) =>
      request<{ range: string; lifetime: any; rangeTotals: any; series: any[]; takeRate: number }>(
        `/api/admin/accounting?range=${range}`, { accessToken }),
    live: (accessToken: string) =>
      request<{ items: any[]; generatedAt: string }>(`/api/admin/live`, { accessToken }),
    getConfig: (accessToken: string) =>
      request<{ settings: Record<string, any>; meta: Record<string, any>; keys: string[]; history: any[] }>(
        `/api/admin/config`, { accessToken }),
    updateConfig: (key: string, value: unknown, accessToken: string) =>
      request<{ ok: true; key: string; value: any; settings: Record<string, any> }>(
        `/api/admin/config`, { method: "PUT", body: { key, value }, accessToken }),
    listAdminUsers: (accessToken: string) =>
      request<{ admins: any[]; roles: string[] }>(`/api/admin/admin-users`, { accessToken }),
    grantAdmin: (body: { piUid: string; role: string; notes?: string }, accessToken: string) =>
      request<{ ok: true }>(`/api/admin/admin-users`, { method: "POST", body, accessToken }),
    updateAdminRole: (body: { piUid: string; role: string }, accessToken: string) =>
      request<{ ok: true }>(`/api/admin/admin-users`, { method: "PATCH", body, accessToken }),
    revokeAdmin: (piUid: string, accessToken: string) =>
      request<{ ok: true }>(`/api/admin/admin-users?piUid=${encodeURIComponent(piUid)}`, { method: "DELETE", accessToken }),
    health: (accessToken: string) =>
      request<{ ok: boolean; checks: any[]; views: any[]; tables: any[]; storage: any; env: any; checkedAt: string }>(
        `/api/admin/health`, { accessToken }),
    /** Suspends or restores a user account (PATCH /api/admin/users/[id]). */
    setUserSuspended: (id: string, suspended: boolean, reason: string, accessToken: string) =>
      request<{ userId: string; suspended: boolean; auditLogged: boolean }>(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: { suspended, reason },
        accessToken,
      }),
    getUserDetail: (id: string, accessToken: string) =>
      request<{ profile: any; listings: any[]; ordersAsBuyer: any[]; ordersAsProvider: any[]; reviews: any[]; reportsFiled: any[]; reportsAgainst: any[]; audit: any[] }>(
        `/api/admin/users/${id}`, { accessToken }),
  },
};

// ---- admin console query helpers ----
export type AdminQuery = Record<string, string | number | boolean | undefined>;

function toQuery(params?: AdminQuery): string {
  if (!params) return "";
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => [k, String(v)] as [string, string]);
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : "";
}

/** Builds an authenticated CSV download URL for /api/admin/export. */
export function adminExportUrl(dataset: string, accessToken: string, params?: AdminQuery): string {
  const base = toQuery({ dataset, ...(params ?? {}) });
  return `/api/admin/export${base}`;
}

/**
 * Downloads an admin CSV export and triggers a browser save. Uses fetch (not a
 * plain link) because the export route requires the Authorization header; the
 * response is turned into a Blob object URL and clicked.
 */
export async function downloadAdminExport(dataset: string, accessToken: string, params?: AdminQuery): Promise<void> {
  const res = await fetch(adminExportUrl(dataset, accessToken, params), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? `Export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `talse-${dataset}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
