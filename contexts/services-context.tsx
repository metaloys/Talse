"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { useRealtimeClient } from "@/contexts/realtime-client-context";
import { backendApi } from "@/lib/backend-api";
import {
  APP_NAME,
  CATEGORIES,
  DEFAULT_PROFILE,
  KEY_PROFILE,
  clampNum,
  cleanMultiline,
  profileToBlob,
  sanitizeProfile,
  todayISO,
  uid,
  type CategoryId,
  type ConversationMessage,
  type DeliveryId,
  type HireRequest,
  
  type Profile,
  type PublicProvider,
  type RequestStatus,
  type Service,
  type Toast,
} from "@/lib/services/data";

// ---- storage surface (kept for profile/meta only — private per-user state) ----
interface StorageApi {
  get: (key: string) => Promise<any>;
  set: (key: string, blob: Record<string, unknown>) => Promise<void>;
}

// ---- debounced, backoff-aware key writer (unchanged — still used for
// profile/meta, which stay per-user private state; listings/requests/
// messages now go through the backend directly instead) ----
class KeyWriter {
  private store: StorageApi;
  private key: string;
  private delay: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: (() => Record<string, unknown>) | null = null;
  private backoff = 0;
  private onTrouble: (v: boolean) => void;
  private static lastAny = 0;

  constructor(store: StorageApi, key: string, delay: number, onTrouble: (v: boolean) => void) {
    this.store = store;
    this.key = key;
    this.delay = delay;
    this.onTrouble = onTrouble;
  }

  schedule(build: () => Record<string, unknown>) {
    this.pending = build;
    if (this.timer) clearTimeout(this.timer);
    const wait = Math.max(this.delay, this.backoff);
    this.timer = setTimeout(() => this.flush(), wait);
  }

  now(build: () => Record<string, unknown>) {
    this.pending = build;
    if (this.timer) clearTimeout(this.timer);
    void this.flush();
  }

  private async flush() {
    if (!this.pending) return;
    const gap = Date.now() - KeyWriter.lastAny;
    if (gap < 1000) {
      const wait = 1000 - gap;
      this.timer = setTimeout(() => this.flush(), wait);
      return;
    }
    const build = this.pending;
    this.pending = null;
    KeyWriter.lastAny = Date.now();
    try {
      await this.store.set(this.key, build());
      this.backoff = 0;
      this.onTrouble(false);
    } catch {
      this.backoff = this.backoff ? Math.min(this.backoff * 1.8, 30000) : 3000;
      this.onTrouble(true);
      this.pending = build;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), this.backoff);
    }
  }

  flushSync() {
    if (this.timer) clearTimeout(this.timer);
    if (this.pending) {
      const build = this.pending;
      this.pending = null;
      void this.store.set(this.key, build()).catch(() => {});
    }
  }
}

// ---- backend <-> UI shape mapping ----
function mapBackendService(row: any): Service {
  return {
    id: row.id,
    ownerId: row.owner_uid,
    ownerName: row.profiles?.display_name || row.profiles?.username || "Provider",
    title: row.title,
    category: row.category,
    description: row.description,
    price: Number(row.price),
    deliveryId: row.delivery_id,
    images: row.images ?? [],
    active: row.active,
    createdAt: new Date(row.created_at).getTime(),
    // Map boosted_until so client can sort the same way server does.
    boostedUntil: row.boosted_until ? new Date(row.boosted_until).getTime() : 0,
    updatedAt: new Date(row.updated_at).getTime(),
    ratingAvg: Number(row.profiles?.rating_avg ?? 0),
    ratingCount: Number(row.profiles?.rating_count ?? 0),
    jobsCompleted: Number(row.profiles?.jobs_completed ?? 0),
    refundsAgainstProvider: Number(row.profiles?.refunds_against_provider ?? 0),
    totalEarned: Number(row.profiles?.total_earned ?? 0),
  };
}

function compareServices(a: Service, b: Service) {
  // Server orders: boosted_until desc, created_at desc
  const aBoost = a.boostedUntil ?? 0;
  const bBoost = b.boostedUntil ?? 0;
  if (aBoost !== bBoost) return bBoost - aBoost;
  if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
  return a.id.localeCompare(b.id);
}

function mapBackendRequest(row: any, currentUid: string | null): HireRequest {
  const direction = row.buyer_uid === currentUid ? "outgoing" : "incoming";
  const status: RequestStatus = row.status;
  return {
    id: row.id,
    requesterPiId: row.buyer_uid,
    requesterName: row.buyer?.display_name || row.buyer?.username || "Buyer",
    providerPiId: row.provider_uid,
    providerName: row.provider?.display_name || row.provider?.username || "Provider",
    providerId: row.provider_uid,
    customerName: row.buyer?.display_name || row.buyer?.username || "Buyer",
    serviceId: row.service_id,
    serviceTitle: row.services?.title ?? "",
    servicePrice: Number(row.amount),
    message: row.message,
    deadline: row.deadline ?? "",
    attachments: row.attachments ?? [],
    status,
    direction,
    createdAt: new Date(row.created_at).getTime(),
    disputeReason: row.dispute_reason ?? null,
    disputeDetails: row.dispute_details ?? null,
    disputeEvidence: row.dispute_evidence ?? [],
    disputeFiledBy: row.dispute_filed_by ?? null,
    disputeStage: row.dispute_stage ?? null,
    adminNote: row.admin_note ?? null,
    resolvedFavor: row.resolved_favor ?? null,
  };
}

function mapBackendMessage(row: any): ConversationMessage {
  return {
    id: row.id,
    conversationId: `hire:${row.hire_request_id}`,
    hireRequestId: row.hire_request_id,
    serviceId: "",
    customerPiId: "",
    providerPiId: "",
    senderPiId: row.sender_uid,
    text: row.text,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    createdAt: new Date(row.created_at).getTime(),
  };
}

// ---- context shape (unchanged — UI components consume this exact surface,
// except the write methods are now async since they hit the network) ----
export interface NewServiceInput {
  title: string;
  category: CategoryId;
  description: string;
  price: number;
  deliveryId: DeliveryId;
  images: string[];
}

export interface HireInput {
  service: Service;
  message: string;
  deadline: string;
  attachments: string[];
}

interface ServicesContextType {
  ready: boolean;
  storageTrouble: boolean;
  username: string;
  currentUid: string | null;

  profile: Profile;
  hasProfile: boolean;
  saveProfile: (patch: Partial<Profile>) => void;

  myListings: Service[];
  allServices: Service[];
  getService: (id: string) => Service | undefined;
  addService: (input: NewServiceInput) => Promise<Service>;
  updateService: (id: string, input: NewServiceInput) => Promise<void>;
  toggleServiceActive: (id: string) => Promise<void>;
  deleteService: (id: string) => Promise<void>;
  refreshServices: () => Promise<void>;
  loadMoreServices: () => Promise<void>;
  hasMore: boolean;
  loadedPages: number;

  getProvider: (id: string) => PublicProvider | undefined;
  servicesByProvider: (id: string) => Service[];

  requests: HireRequest[];
  outgoing: HireRequest[];
  incoming: HireRequest[];
  hire: (input: HireInput) => Promise<void>;
  setRequestStatus: (id: string, status: RequestStatus) => Promise<void>;
  fileDispute: (id: string, input: { reason: string; details?: string; evidence?: string[] }) => Promise<void>;
  refreshRequests: () => Promise<void>;

  messages: ConversationMessage[];
  messagesForRequest: (hireRequestId: string) => ConversationMessage[];
  sendMessage: (hireRequestId: string, text: string, attachments?: string[]) => Promise<void>;
  loadMessagesForRequest: (hireRequestId: string, before?: string | number) => Promise<{ fetched: number; hasMore?: boolean }>;

  toasts: Toast[];
  pushToast: (text: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: string) => void;
}

const ServicesContext = createContext<ServicesContextType | undefined>(undefined);

export function ServicesProvider({ children }: { children: ReactNode }) {
  const { sdk, accessToken, piUser } = usePiAuth();

  // Profile/meta remain private per-user state via the existing SDK store —
  // this was never the shared-data gap (see backend README §1). Everything
  // else below (listings, requests, messages) now goes through backendApi.
  const storeRef = useRef<StorageApi | null>(null);
  const anySdk = sdk as any;
  const userStore = anySdk?.userState ?? anySdk?.state;
  if (!storeRef.current && userStore && typeof userStore.get === "function" && typeof userStore.set === "function") {
    storeRef.current = userStore as StorageApi;
  }

  const [ready, setReady] = useState(false);
  const [storageTrouble, setStorageTrouble] = useState(false);
  const [username, setUsername] = useState("Pioneer");

  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);

  const [listings, setListings] = useState<Service[]>([]);
  const [requests, setRequests] = useState<HireRequest[]>([]);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);

  const [toasts, setToasts] = useState<Toast[]>([]);

  // Pagination state (client-side): perPage is configurable client-side but
  // server enforces a hard cap of 50. loadedPages tracks how many pages the
  // user has loaded (1 = first page). Use refs to avoid unnecessary re-renders.
  const perPageRef = useRef<number>(20);
  const loadedPagesRef = useRef<number>(1);
  const hasMoreRef = useRef<boolean>(true);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loadedPages, setLoadedPages] = useState<number>(1);
  // Serialize concurrent writers to `listings` to avoid interleaved updates.
  // If a sync is in progress, further requests will skip.
  const isSyncingRef = useRef<boolean>(false);

  const profileRef = useRef(profile);
  profileRef.current = profile;

  const troubleRef = useRef((v: boolean) => setStorageTrouble(v));
  const profileWriter = useRef<KeyWriter | null>(null);

  if (!profileWriter.current) {
    if (accessToken) {
      const netStore: StorageApi = {
        get: async (_k: string) => {
          const res = await fetch("/api/profile", { headers: { Authorization: `Bearer ${accessToken}` } });
          if (!res.ok) throw new Error("Failed to load profile");
          return res.json();
        },
        set: async (_k: string, blob: Record<string, unknown>) => {
          await fetch("/api/profile", {
            method: "PATCH",
            headers: { "content-type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify(blob),
          });
        },
      };
      profileWriter.current = new KeyWriter(netStore, KEY_PROFILE, 900, troubleRef.current);
    } else if (storeRef.current) {
      profileWriter.current = new KeyWriter(storeRef.current, KEY_PROFILE, 900, troubleRef.current);
    }
  }

  const pushToast = (text: string, tone: Toast["tone"] = "info") => {
    const id = uid();
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  };
  const dismissToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  // ---- backend loaders ----
  const refreshServices = async () => {
    try {
      // reset to first page
      loadedPagesRef.current = 1;
      const perPage = perPageRef.current;
      const res = await backendApi.services.list({ page: 1, perPage });
      // Owner-path responses remain unpaginated ({ services: [...] })
      if ((res as any).page === undefined) {
        const services = (res as any).services ?? [];
        setListings(services.map(mapBackendService));
        hasMoreRef.current = false;
        return;
      }
      const pag = res as { services: any[]; page: number; perPage: number; total: number; hasMore: boolean };
      setListings((pag.services ?? []).map(mapBackendService));
      hasMoreRef.current = !!pag.hasMore;
      setHasMore(hasMoreRef.current);
      loadedPagesRef.current = 1;
      setLoadedPages(1);
    } catch (err) {
      console.error("[Services] Failed to load services:", err);
      setStorageTrouble(true);
    }
  };

  const loadMoreServices = async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      if (!hasMoreRef.current) return;
      const nextPage = loadedPagesRef.current + 1;
      const perPage = perPageRef.current;
      const res = await backendApi.services.list({ page: nextPage, perPage });
      // Owner-path responses should not be using loadMore; guard anyway
      if ((res as any).page === undefined) return;
      const pag = res as { services: any[]; page: number; perPage: number; total: number; hasMore: boolean };
      const newServices = (pag.services ?? []).map(mapBackendService);
      setListings((prev) => {
        // Merge and dedupe by id, preferring the later items (newServices).
        const combined = [...prev, ...newServices];
        const byId = new Map<string, Service>();
        for (const s of combined) byId.set(s.id, s);
        const merged = Array.from(byId.values()).sort(compareServices);
        // update published refs/states
        hasMoreRef.current = !!pag.hasMore;
        loadedPagesRef.current = nextPage;
        setHasMore(hasMoreRef.current);
        setLoadedPages(loadedPagesRef.current);
        return merged;
      });
      
    } catch (err) {
      console.error("[Services] Failed to load more services:", err);
    } finally {
      isSyncingRef.current = false;
    }
  };

  const refreshRequests = async () => {
    if (!accessToken) return;
    try {
      const perPage = perPageRef.current;

      const fetchAllForRole = async (role: "outgoing" | "incoming") => {
        let page = 1;
        let all: any[] = [];
        while (true) {
          const res = await backendApi.hireRequests.listMine(role, accessToken, { page, perPage });
          const chunk = (res as any).requests ?? [];
          all = all.concat(chunk);
          const hasMore = (res as any).hasMore === true;
          if (!hasMore) break;
          page += 1;
        }
        return all;
      };

      const [outReqs, inReqs] = await Promise.all([fetchAllForRole("outgoing"), fetchAllForRole("incoming")]);
      const merged = [...outReqs, ...inReqs].map((r) => mapBackendRequest(r, piUser?.uid ?? null));
      const byId = new Map(merged.map((r) => [r.id, r]));
      setRequests(Array.from(byId.values()));
    } catch (err) {
      console.error("[Services] Failed to load hire requests:", err);
    }
  };

    const realtimeClient = useRealtimeClient();

    const refreshRequestsRef = useRef(refreshRequests);
    useEffect(() => {
      refreshRequestsRef.current = refreshRequests;
    });

    const loadMessagesForRequestRef = useRef<typeof loadMessagesForRequest | null>(null);
    useEffect(() => {
      loadMessagesForRequestRef.current = loadMessagesForRequest;
    });

    const requestIdsKey = useMemo(
      () => requests.map((r) => r.id).sort().join(","),
      [requests]
    );

    const channelsRef = useRef<Map<string, ReturnType<typeof realtimeClient.channel>>>(new Map());

    useEffect(() => {
      const currentIds = new Set(requestIdsKey ? requestIdsKey.split(",") : []);
      const existing = channelsRef.current;

      for (const id of currentIds) {
        if (!existing.has(id)) {
          const channel = realtimeClient.channel(`hire_request:${id}`, {
            config: { private: true },
          });
          channel.on("broadcast", { event: "*" }, (ev: any) => {
            try {
              const evName = ev?.event ?? ev?.type ?? null;
              const payload = ev?.payload ?? ev?.data ?? ev?.body ?? null;
              if (evName === "message_added") {
                const hireRequestId = payload?.hire_request_id ?? payload?.hireRequestId ?? payload?.hire_request ?? payload?.hireRequest ?? null;
                if (hireRequestId) {
                  // Use ref to avoid stale closure
                  loadMessagesForRequestRef.current?.(hireRequestId);
                  return;
                }
              }
            } catch (err) {
              // fall back to full refresh on any unexpected payload shape
            }
            refreshRequestsRef.current();
          });
          channel.subscribe();
          existing.set(id, channel);
        }
      }

      for (const [id, channel] of existing) {
        if (!currentIds.has(id)) {
          channel.unsubscribe();
          existing.delete(id);
        }
      }
    }, [requestIdsKey, realtimeClient]);

    // ---- global services-feed subscription (single public channel) ----
    const refreshServicesRef = useRef(refreshServices);
    useEffect(() => {
      refreshServicesRef.current = refreshServices;
    });

    // Re-fetch the set of currently-loaded pages (used by realtime updates).
    const reFetchLoadedPages = async () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      try {
        const pages = loadedPagesRef.current || 1;
        if (pages <= 1) {
          await refreshServices();
          return;
        }
        const perPage = perPageRef.current;
        const byId = new Map<string, any>();
        for (let p = 1; p <= pages; p++) {
          const res = await backendApi.services.list({ page: p, perPage });
          const chunk = (res as any).services ?? [];
          for (const row of chunk) {
            // keep last-seen row for this id (overwrite duplicates)
            byId.set(row.id, row);
          }
        }
        const merged = Array.from(byId.values()).map(mapBackendService).sort(compareServices);
        setListings(merged);
      } catch (err) {
        console.error("[Services] Failed to re-fetch loaded pages:", err);
      } finally {
        isSyncingRef.current = false;
      }
    };
    const reFetchLoadedPagesRef = useRef(reFetchLoadedPages);
    useEffect(() => {
      reFetchLoadedPagesRef.current = reFetchLoadedPages;
    });

    useEffect(() => {
      // create a single, persistent public channel for service feed updates
      const servicesChannel = realtimeClient.channel("services-feed", { config: { private: false } });
      servicesChannel.on("broadcast", { event: "*" }, () => {
        // signal-only: re-fetch the currently-loaded pages so users who
        // scrolled to page N stay on page N (not truncated back to page 1).
        reFetchLoadedPagesRef.current();
      });
      servicesChannel.subscribe();

      return () => {
        try {
          servicesChannel.unsubscribe();
        } catch (err) {
          // ignore
        }
      };
    }, [realtimeClient]);

    useEffect(() => {
      return () => {
        for (const channel of channelsRef.current.values()) {
          channel.unsubscribe();
        }
        channelsRef.current.clear();
      };
    }, []);

  const loadMessagesForRequest = async (hireRequestId: string, before?: string | number) => {
    if (!accessToken) return { fetched: 0 };
    try {
      const limit = 50;
      const params: any = { limit };
      if (before) params.before = String(before);
      const { messages: msgs, hasMore } = await backendApi.messages.list(hireRequestId, accessToken, params as any);
      const mapped = (msgs ?? []).map(mapBackendMessage);
      setMessages((prev) => {
        const others = prev.filter((m) => m.hireRequestId !== hireRequestId);
        const existingFor = prev.filter((m) => m.hireRequestId === hireRequestId).sort((a, b) => a.createdAt - b.createdAt);
        if (before) {
          // mapped contains older messages (ascending); merge them before existing
          const merged = [...mapped, ...existingFor];
          return [...others, ...merged];
        }
        // replace with latest page
        return [...others, ...mapped];
      });
      return { fetched: (mapped ?? []).length, hasMore: !!hasMore };
    } catch (err) {
      console.error("[Services] Failed to load messages:", err);
      return { fetched: 0 };
    }
  };

  // ---- boot ----
  useEffect(() => {
    let cancelled = false;

    try {
      const winPiUser = (window as any)?.Pi?.currentUser?.username;
      if (typeof winPiUser === "string" && winPiUser.trim()) setUsername(winPiUser.trim());
    } catch {
      // ignore
    }
    if (piUser?.username) setUsername(piUser.username);

    (async () => {
      const store = storeRef.current;
      if (accessToken) {
        try {
          const res = await fetch("/api/profile", { headers: { Authorization: `Bearer ${accessToken}` } });
          if (res.ok) {
            const data = await res.json();
            if (!cancelled) {
              const loadedProfile = {
                ...sanitizeProfile(data),
                piId: sanitizeProfile(data).piId || username || "Pioneer",
              };
              setProfile(loadedProfile);
            }
          } else {
            // fallback to legacy store if available
            if (store && profileWriter.current) {
              try {
                const pRec = await store.get(KEY_PROFILE).catch(() => null);
                if (!cancelled) {
                  const loadedProfile = {
                    ...sanitizeProfile(pRec),
                    piId: sanitizeProfile(pRec).piId || username || "Pioneer",
                  };
                  setProfile(loadedProfile);
                }
              } catch {
                if (!cancelled) setStorageTrouble(true);
              }
            }
          }
        } catch (e) {
          // network error — fallback to legacy store if available
          if (store && profileWriter.current) {
            try {
              const pRec = await store.get(KEY_PROFILE).catch(() => null);
              if (!cancelled) {
                const loadedProfile = {
                  ...sanitizeProfile(pRec),
                  piId: sanitizeProfile(pRec).piId || username || "Pioneer",
                };
                setProfile(loadedProfile);
              }
            } catch {
              if (!cancelled) setStorageTrouble(true);
            }
          } else {
            if (!cancelled) setStorageTrouble(true);
          }
        }
      } else {
        if (store && profileWriter.current) {
          try {
            const pRec = await store.get(KEY_PROFILE).catch(() => null);
            if (!cancelled) {
              const loadedProfile = {
                ...sanitizeProfile(pRec),
                piId: sanitizeProfile(pRec).piId || username || "Pioneer",
              };
              setProfile(loadedProfile);
            }
          } catch {
            if (!cancelled) setStorageTrouble(true);
          }
        }
      }

      await refreshServices();
      if (cancelled) return;

      if (accessToken) {
        await refreshRequests();
      }

      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdk, accessToken]);

  useEffect(() => {
    const flushAll = () => {
      profileWriter.current?.flushSync();
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flushAll();
    };
    window.addEventListener("pagehide", flushAll);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flushAll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // ---- profile (unchanged: private per-user state) ----
  const hasProfile = profile.joinedAt > 0;

  const persistProfile = (next: Profile, immediate = false) => {
    setProfile(next);
    profileRef.current = next;
    if (immediate) profileWriter.current?.now(() => profileToBlob(next));
    else profileWriter.current?.schedule(() => profileToBlob(next));
  };

  const saveProfile = (patch: Partial<Profile>) => {
    const cur = profileRef.current;
    const next: Profile = {
      piId: cur.piId || username || "Pioneer",
      name: patch.name !== undefined ? patch.name : cur.name,
      bio: patch.bio !== undefined ? patch.bio : cur.bio,
      location: patch.location !== undefined ? patch.location : cur.location,
      joinedAt: cur.joinedAt > 0 ? cur.joinedAt : Date.now(),
    };
    persistProfile(next, true);
    pushToast("Profile saved", "success");
  };

  // ---- listings (now backend-backed) ----
  const requireAuth = (): string => {
    if (!accessToken) {
      pushToast("Please wait for Pi authentication to finish", "warning");
      throw new Error("Not authenticated");
    }
    return accessToken;
  };

  const addService = async (input: NewServiceInput): Promise<Service> => {
    const token = requireAuth();
    const { service } = await backendApi.services.create(
      {
        title: input.title,
        category: input.category,
        description: input.description,
        price: input.price,
        deliveryId: input.deliveryId,
        images: input.images.slice(0, 4),
      },
      token
    );
    const mapped = mapBackendService(service);
    setListings((prev) => [mapped, ...prev]);
    pushToast("Service published", "success");
    return mapped;
  };

  const updateService = async (id: string, input: NewServiceInput): Promise<void> => {
    const token = requireAuth();
    const { service } = await backendApi.services.update(
      id,
      {
        title: input.title,
        category: input.category,
        description: input.description,
        price: input.price,
        delivery_id: input.deliveryId,
        images: input.images.slice(0, 4),
      },
      token
    );
    const mapped = mapBackendService(service);
    setListings((prev) => prev.map((s) => (s.id === id ? mapped : s)));
    pushToast("Service updated", "success");
  };

  const toggleServiceActive = async (id: string): Promise<void> => {
    const token = requireAuth();
    const target = listings.find((s) => s.id === id);
    if (!target) return;
    const { service } = await backendApi.services.update(id, { active: !target.active }, token);
    const mapped = mapBackendService(service);
    setListings((prev) => prev.map((s) => (s.id === id ? mapped : s)));
    pushToast(mapped.active ? "Service is now active" : "Service deactivated", mapped.active ? "success" : "warning");
  };

  const deleteService = async (id: string): Promise<void> => {
    const token = requireAuth();
    await backendApi.services.remove(id, token);
    setListings((prev) => prev.filter((s) => s.id !== id));
    pushToast("Service removed", "warning");
  };

  // ---- requests (now backend-backed) ----
  const hire = async (input: HireInput): Promise<void> => {
    const token = requireAuth();
    const { request } = await backendApi.hireRequests.create(
      {
        serviceId: input.service.id,
        message: input.message,
        deadline: input.deadline || undefined,
        attachments: input.attachments,
      },
      token
    );
    setRequests((prev) => [mapBackendRequest(request, piUser?.uid ?? null), ...prev]);
    pushToast("Hire request sent", "success");
  };

  const setRequestStatus = async (id: string, status: RequestStatus): Promise<void> => {
    const token = requireAuth();
    const backendStatus = status === "declined" ? "cancelled" : status;
    const { request } = await backendApi.hireRequests.setStatus(id, backendStatus, token);
    setRequests((prev) => prev.map((r) => (r.id === id ? mapBackendRequest(request, piUser?.uid ?? null) : r)));
    if (status === "accepted") pushToast("Request accepted", "success");
    else if (status === "declined") pushToast("Request declined", "warning");
  };

  const fileDispute = async (
    id: string,
    input: { reason: string; details?: string; evidence?: string[] }
  ): Promise<void> => {
    const token = requireAuth();
    const { request } = await backendApi.hireRequests.fileDispute(id, input, token);
    setRequests((prev) => prev.map((r) => (r.id === id ? mapBackendRequest(request, piUser?.uid ?? null) : r)));
    pushToast("Dispute filed", "warning");
  };

  // ---- messages (now backend-backed) ----
  const sendMessage = async (hireRequestId: string, text: string, attachments: string[] = []): Promise<void> => {
    const token = requireAuth();
    const messageText = cleanMultiline(text, 2000);
    if (!messageText) return;
    const { message } = await backendApi.messages.send(hireRequestId, messageText, token, attachments.length ? attachments : undefined);
    setMessages((prev) => [...prev, mapBackendMessage(message)]);
  };

  const messagesForRequest = (hireRequestId: string) => {
    return messages.filter((m) => m.hireRequestId === hireRequestId).sort((a, b) => a.createdAt - b.createdAt);
  };

  // ---- derived ----
  const currentUid = piUser?.uid ?? null;
  const allServices = useMemo(
    () => listings.filter((s) => s.active).sort((a, b) => b.createdAt - a.createdAt),
    [listings]
  );
  const myListings = useMemo(() => listings.filter((s) => s.ownerId === currentUid), [listings, currentUid]);

  const getService = (id: string): Service | undefined => {
    const service = listings.find((s) => s.id === id);
    if (!service) return undefined;
    const isOwner = service.ownerId === currentUid;
    return service.active || isOwner ? service : undefined;
  };

  const getProvider = (id: string): PublicProvider | undefined => {
    const p = profileRef.current;
    if (id === currentUid) {
      return {
        id: currentUid ?? "me",
        name: p.name || username || "You",
        bio: p.bio,
        location: p.location,
        joinedAt: p.joinedAt || Date.now(),
        isMe: true,
            ratingAvg: p.ratingAvg ?? 0,
            ratingCount: p.ratingCount ?? 0,
            jobsCompleted: p.jobsCompleted ?? 0,
            refundsAgainstProvider: p.refundsAgainstProvider ?? 0,
            totalEarned: p.totalEarned ?? 0,
      };
    }
    const service = listings.find((item) => item.ownerId === id && item.active);
    return service
      ? {
          id,
          name: service.ownerName,
          bio: "",
          location: "",
          joinedAt: service.createdAt,
          isMe: false,
          ratingAvg: service.ratingAvg ?? 0,
          ratingCount: service.ratingCount ?? 0,
          jobsCompleted: 0,
          refundsAgainstProvider: 0,
          totalEarned: 0,
        }
      : undefined;
  };

  const servicesByProvider = (id: string): Service[] =>
    listings.filter((s) => s.ownerId === id && s.active).sort((a, b) => b.createdAt - a.createdAt);

  const outgoing = useMemo(() => requests.filter((r) => r.direction === "outgoing"), [requests]);
  const incoming = useMemo(() => requests.filter((r) => r.direction === "incoming"), [requests]);

  const value: ServicesContextType = {
    ready,
    storageTrouble,
    username,
    currentUid,
    profile,
    hasProfile,
    saveProfile,
    myListings,
    allServices,
    getService,
    addService,
    updateService,
    toggleServiceActive,
    deleteService,
    refreshServices,
    loadMoreServices,
    hasMore,
    loadedPages,
    getProvider,
    servicesByProvider,
    requests,
    outgoing,
    incoming,
    hire,
    setRequestStatus,
    fileDispute,
    refreshRequests,
    messages,
    messagesForRequest,
    sendMessage,
    loadMessagesForRequest,
    toasts,
    pushToast,
    dismissToast,
  };

  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

export function useServices() {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error("useServices must be used within ServicesProvider");
  return ctx;
}

// re-export a couple of constants used by UI convenience
export { APP_NAME, CATEGORIES, todayISO, clampNum };
