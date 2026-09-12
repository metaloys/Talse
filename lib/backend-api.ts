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
    create: (body: { title: string; category: string; description: string; price: number; deliveryId: string; images?: string[] }, accessToken: string) =>
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
    dashboard: (accessToken: string) => request<{ counts: any }>(`/api/admin/dashboard`, { accessToken }),
    listUsers: (params?: { search?: string; page?: number; perPage?: number }, accessToken?: string) => {
      const qs = params ? new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))).toString() : "";
      return request<{ users: any[] }>(`/api/admin/users${qs ? `?${qs}` : ""}`, { accessToken });
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
    listAuditEvents: (params?: { target_type?: "user" | "service" | "review"; action?: string; page?: number; perPage?: number }, accessToken?: string) => {
      const qs = params ? new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))).toString() : "";
      return request<{ auditEvents: any[]; count?: number }>(`/api/admin/audit-events${qs ? `?${qs}` : ""}`, { accessToken });
    },
    updateReport: (id: string, body: { status?: string; admin_note?: string }, accessToken: string) =>
      request<{ report: any }>(`/api/admin/reports/${id}`, { method: "PATCH", body, accessToken }),
    listCategories: (accessToken?: string) => request<{ categories: any[] }>(`/api/admin/categories`, { accessToken }),
    createCategory: (body: { id: string; label: string; short: string; blurb: string; hue: number; active?: boolean; sort_order?: number }, accessToken: string) =>
      request<{ category: any }>(`/api/admin/categories`, { method: "POST", body, accessToken }),
    updateCategory: (id: string, body: Record<string, unknown>, accessToken: string) =>
      request<{ category: any }>(`/api/admin/categories/${id}`, { method: "PATCH", body, accessToken }),
  },
};
