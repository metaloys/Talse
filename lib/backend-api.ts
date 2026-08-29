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
    list: (params?: { category?: string; q?: string; owner?: string }) => {
      const qs = new URLSearchParams(params as Record<string, string>).toString();
      return request<{ services: any[] }>(`/api/services${qs ? `?${qs}` : ""}`);
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

  hireRequests: {
    listMine: (role: "incoming" | "outgoing", accessToken: string) =>
      request<{ requests: any[] }>(`/api/hire-requests?role=${role}`, { accessToken }),
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
  },

  messages: {
    list: (hireRequestId: string, accessToken: string) =>
      request<{ messages: any[] }>(`/api/messages?hireRequestId=${hireRequestId}`, { accessToken }),
    send: (hireRequestId: string, text: string, accessToken: string) =>
      request<{ message: any }>(`/api/messages`, { method: "POST", body: { hireRequestId, text }, accessToken }),
  },

  reviews: {
    listForProvider: (providerUid: string) =>
      request<{ reviews: any[] }>(`/api/reviews?provider=${providerUid}`),
    create: (body: { hireRequestId: string; rating: number; text?: string }, accessToken: string) =>
      request<{ review: any }>(`/api/reviews`, { method: "POST", body, accessToken }),
  },

  admin: {
    listDisputes: (accessToken: string) =>
      request<{ disputes: any[] }>(`/api/admin/disputes`, { accessToken }),
    updateDispute: (id: string, body: { stage?: "investigating" | "escalated"; note?: string }, accessToken: string) =>
      request<{ request: any }>(`/api/admin/disputes/${id}`, { method: "PATCH", body, accessToken }),
    resolveDispute: (id: string, body: { favorProvider: boolean; note?: string }, accessToken: string) =>
      request<{ request: any }>(`/api/admin/disputes/${id}/resolve`, { method: "POST", body, accessToken }),
  },
};
