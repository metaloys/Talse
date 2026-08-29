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
import { backendApi } from "@/lib/backend-api";
import {
  APP_NAME,
  CATEGORIES,
  DEFAULT_META,
  DEFAULT_PROFILE,
  KEY_META,
  KEY_PROFILE,
  clampNum,
  cleanMultiline,
  metaToBlob,
  profileToBlob,
  sanitizeMeta,
  sanitizeProfile,
  todayISO,
  uid,
  type CategoryId,
  type ConversationMessage,
  type DeliveryId,
  type HireRequest,
  type MetaState,
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
    updatedAt: new Date(row.updated_at).getTime(),
  };
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
  sendMessage: (hireRequestId: string, text: string) => Promise<void>;
  loadMessagesForRequest: (hireRequestId: string) => Promise<void>;

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
  const [meta, setMeta] = useState<MetaState>(DEFAULT_META);

  const [listings, setListings] = useState<Service[]>([]);
  const [requests, setRequests] = useState<HireRequest[]>([]);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);

  const [toasts, setToasts] = useState<Toast[]>([]);

  const profileRef = useRef(profile);
  const metaRef = useRef(meta);
  profileRef.current = profile;
  metaRef.current = meta;

  const troubleRef = useRef((v: boolean) => setStorageTrouble(v));
  const profileWriter = useRef<KeyWriter | null>(null);
  const metaWriter = useRef<KeyWriter | null>(null);

  if (!profileWriter.current && storeRef.current) {
    const store = storeRef.current;
    profileWriter.current = new KeyWriter(store, KEY_PROFILE, 900, troubleRef.current);
    metaWriter.current = new KeyWriter(store, KEY_META, 1200, troubleRef.current);
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
      const { services } = await backendApi.services.list();
      setListings(services.map(mapBackendService));
    } catch (err) {
      console.error("[Services] Failed to load services:", err);
      setStorageTrouble(true);
    }
  };

  const refreshRequests = async () => {
    if (!accessToken) return;
    try {
      const [{ requests: outReqs }, { requests: inReqs }] = await Promise.all([
        backendApi.hireRequests.listMine("outgoing", accessToken),
        backendApi.hireRequests.listMine("incoming", accessToken),
      ]);
      const merged = [...outReqs, ...inReqs].map((r) => mapBackendRequest(r, piUser?.uid ?? null));
      const byId = new Map(merged.map((r) => [r.id, r]));
      setRequests(Array.from(byId.values()));
    } catch (err) {
      console.error("[Services] Failed to load hire requests:", err);
    }
  };

  const loadMessagesForRequest = async (hireRequestId: string) => {
    if (!accessToken) return;
    try {
      const { messages: msgs } = await backendApi.messages.list(hireRequestId, accessToken);
      const mapped = msgs.map(mapBackendMessage);
      setMessages((prev) => [...prev.filter((m) => m.hireRequestId !== hireRequestId), ...mapped]);
    } catch (err) {
      console.error("[Services] Failed to load messages:", err);
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
      if (store && profileWriter.current) {
        try {
          const [pRec, mRec] = await Promise.all([store.get(KEY_PROFILE), store.get(KEY_META)]);
          if (!cancelled) {
            const loadedProfile = {
              ...sanitizeProfile(pRec),
              piId: sanitizeProfile(pRec).piId || username || "Pioneer",
            };
            setProfile(loadedProfile);
            setMeta(sanitizeMeta(mRec));
          }
        } catch {
          if (!cancelled) setStorageTrouble(true);
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
      metaWriter.current?.flushSync();
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
  const sendMessage = async (hireRequestId: string, text: string): Promise<void> => {
    const token = requireAuth();
    const messageText = cleanMultiline(text, 2000);
    if (!messageText) return;
    const { message } = await backendApi.messages.send(hireRequestId, messageText, token);
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
      };
    }
    const service = listings.find((item) => item.ownerId === id && item.active);
    return service
      ? { id, name: service.ownerName, bio: "", location: "", joinedAt: service.createdAt, isMe: false }
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
