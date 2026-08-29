// ---------- App meta ----------
export const APP_NAME = "Pi Services";
export const APP_TAGLINE = "Hire and offer services with Pi.";
export const CURRENCY = "π";
export const DISCLAIMER =
  "Pi Services is an independent community-built application and is not operated, endorsed, or guaranteed by Pi Network.";

// ---------- storage keys ----------
export const KEY_PROFILE = "services.profile";
// Listings use the app-level state namespace so the catalogue is shared across all Pioneers.
// Profile, requests, metadata, and messages remain user-scoped in their existing keys.
export const KEY_LISTINGS = "services.global.listings";
export const KEY_REQUESTS = "services.requests";
export const KEY_META = "services.meta";
export const KEY_MESSAGES = "services.messages";

// ---------- caps ----------
export const LISTINGS_CAP = 40;
export const REQUESTS_CAP = 80;
export const MAX_IMAGES = 4;
export const TITLE_MAX = 80;
export const DESC_MAX = 1200;
export const BIO_MAX = 400;
export const NAME_MAX = 60;
export const LOCATION_MAX = 60;
export const MESSAGE_MAX = 600;
export const MAX_PRICE = 1_000_000;

// ---------- types ----------
export type TabId = "home" | "categories" | "search" | "activity" | "profile";

export type CategoryId =
  | "design"
  | "development"
  | "marketing"
  | "business"
  | "education"
  | "home"
  | "other";

export interface CategoryDef {
  id: CategoryId;
  label: string;
  short: string;
  blurb: string;
  hue: number;
}

// Widened to match the real payment lifecycle in hire_requests.status
// (supabase/schema.sql) now that payments are backend-verified instead of
// mocked. "declined" is kept as an alias UI can still use; the backend
// stores it as "cancelled".
export type RequestStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "locked"
  | "delivered"
  | "released"
  | "disputed"
  | "refunded"
  | "cancelled";
export type RequestDirection = "outgoing" | "incoming";

export interface Service {
  id: string;
  ownerId: string; // "me" for the connected Pioneer, else seed id
  ownerName: string;
  title: string;
  category: CategoryId;
  description: string;
  price: number;
  deliveryId: DeliveryId;
  images: string[]; // image query strings -> placeholder.svg
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface HireRequest {
  id: string;
  requesterPiId: string;
  requesterName: string;
  providerPiId: string;
  providerName: string;
  // Legacy display aliases retained for existing activity UI.
  providerId: string;
  customerName: string;
  serviceId: string;
  serviceTitle: string;
  servicePrice: number;
  message: string;
  deadline: string; // ISO date
  attachments: string[]; // reference labels only
  status: RequestStatus;
  direction: RequestDirection;
  createdAt: number;
  // Dispute detail — present once status has ever been 'disputed'.
  disputeReason?: string | null;
  disputeDetails?: string | null;
  disputeEvidence?: string[];
  disputeFiledBy?: string | null;
  disputeStage?: "investigating" | "escalated" | "resolved" | null;
  adminNote?: string | null;
  resolvedFavor?: "provider" | "buyer" | null;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  hireRequestId: string;
  serviceId: string;
  customerPiId: string;
  providerPiId: string;
  senderPiId: string;
  text: string;
  createdAt: number;
}

export interface Profile {
  piId: string;
  name: string;
  bio: string;
  location: string;
  joinedAt: number;
}

export interface SeedProvider {
  id: string;
  name: string;
  bio: string;
  location: string;
  joinedAt: number;
}

export interface Toast {
  id: string;
  text: string;
  tone: "success" | "warning" | "danger" | "info";
}

// ---------- categories ----------
export const CATEGORIES: CategoryDef[] = [
  { id: "design", label: "Design & Creative", short: "Design", blurb: "Graphic design, video, writing", hue: 295 },
  { id: "development", label: "Development & Tech", short: "Dev & Tech", blurb: "Coding, websites, apps", hue: 230 },
  { id: "marketing", label: "Marketing & Growth", short: "Marketing", blurb: "Social media, SEO, ads", hue: 25 },
  { id: "business", label: "Business & Consulting", short: "Business", blurb: "Advice, planning, strategy", hue: 200 },
  { id: "education", label: "Education & Tutoring", short: "Education", blurb: "Lessons, coaching", hue: 150 },
  { id: "home", label: "Home & Lifestyle", short: "Home", blurb: "Errands, tasks, personal services", hue: 60 },
  { id: "other", label: "Other", short: "Other", blurb: "Everything else", hue: 320 },
];

export const CATEGORY_MAP: Record<CategoryId, CategoryDef> = CATEGORIES.reduce(
  (acc, c) => {
    acc[c.id] = c;
    return acc;
  },
  {} as Record<CategoryId, CategoryDef>,
);

export const CATEGORY_ID_SET = new Set<string>(CATEGORIES.map((c) => c.id));

export function isCategoryId(v: unknown): v is CategoryId {
  return typeof v === "string" && CATEGORY_ID_SET.has(v);
}

export function categoryLabel(id: CategoryId): string {
  return CATEGORY_MAP[id]?.label ?? "Other";
}

// ---------- delivery options ----------
export type DeliveryId = "1d" | "3d" | "1w" | "2w" | "1m";

export interface DeliveryDef {
  id: DeliveryId;
  label: string;
  days: number;
}

export const DELIVERY_OPTIONS: DeliveryDef[] = [
  { id: "1d", label: "1 day", days: 1 },
  { id: "3d", label: "3 days", days: 3 },
  { id: "1w", label: "1 week", days: 7 },
  { id: "2w", label: "2 weeks", days: 14 },
  { id: "1m", label: "1 month", days: 30 },
];

export const DELIVERY_MAP: Record<DeliveryId, DeliveryDef> = DELIVERY_OPTIONS.reduce(
  (acc, d) => {
    acc[d.id] = d;
    return acc;
  },
  {} as Record<DeliveryId, DeliveryDef>,
);

export const DELIVERY_ID_SET = new Set<string>(DELIVERY_OPTIONS.map((d) => d.id));

export function isDeliveryId(v: unknown): v is DeliveryId {
  return typeof v === "string" && DELIVERY_ID_SET.has(v);
}

export function deliveryLabel(id: DeliveryId): string {
  return DELIVERY_MAP[id]?.label ?? "1 week";
}

export function deliveryDays(id: DeliveryId): number {
  return DELIVERY_MAP[id]?.days ?? 7;
}

// ---------- price bands (filter) ----------
export type PriceBandId = "any" | "u10" | "10-50" | "50-100" | "o100";

export interface PriceBandDef {
  id: PriceBandId;
  label: string;
  min: number;
  max: number;
}

export const PRICE_BANDS: PriceBandDef[] = [
  { id: "any", label: "Any price", min: 0, max: Infinity },
  { id: "u10", label: "Under 10 π", min: 0, max: 10 },
  { id: "10-50", label: "10 – 50 π", min: 10, max: 50 },
  { id: "50-100", label: "50 – 100 π", min: 50, max: 100 },
  { id: "o100", label: "Over 100 π", min: 100, max: Infinity },
];

export const PRICE_BAND_MAP: Record<PriceBandId, PriceBandDef> = PRICE_BANDS.reduce(
  (acc, b) => {
    acc[b.id] = b;
    return acc;
  },
  {} as Record<PriceBandId, PriceBandDef>,
);

export function inPriceBand(price: number, band: PriceBandId): boolean {
  const b = PRICE_BAND_MAP[band] ?? PRICE_BAND_MAP.any;
  return price >= b.min && price < b.max;
}

// ---------- sort ----------
export type SortId = "recent" | "price-asc" | "price-desc" | "fastest";

export const SORTS: { id: SortId; label: string }[] = [
  { id: "recent", label: "Most recent" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
  { id: "fastest", label: "Fastest delivery" },
];

export const SORT_ID_SET = new Set<string>(SORTS.map((s) => s.id));

export function isSortId(v: unknown): v is SortId {
  return typeof v === "string" && SORT_ID_SET.has(v);
}

// ---------- small utils ----------
export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function clampNum(v: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function cleanStr(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // strip control chars and angle brackets
  return v
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, max);
}

export function cleanMultiline(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, max);
}

export function parsePrice(v: string): number {
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return round2(Math.min(MAX_PRICE, n));
}

export function formatPi(n: number): string {
  const rounded = round2(n);
  const str = Number.isInteger(rounded)
    ? rounded.toLocaleString("en-US")
    : rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${str} ${CURRENCY}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "PS";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function serviceImage(query: string, w = 600, h = 600): string {
  const q = encodeURIComponent(query || "service");
  return `/placeholder.svg?height=${h}&width=${w}&query=${q}`;
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function matchesQuery(service: Service, q: string): boolean {
  const nq = normalize(q.trim());
  if (!nq) return true;
  const hay = normalize(
    `${service.title} ${service.description} ${service.ownerName} ${categoryLabel(service.category)}`,
  );
  return nq.split(/\s+/).every((tok) => hay.includes(tok));
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isValidISO(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function formatDate(iso: string): string {
  if (!isValidISO(iso)) return iso;
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatMonthYear(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

// ---------- status meta ----------
export const STATUS_META: Record<RequestStatus, { label: string; tone: "warning" | "success" | "danger" }> = {
  pending: { label: "Pending", tone: "warning" },
  accepted: { label: "Accepted \u2014 awaiting payment", tone: "warning" },
  declined: { label: "Declined", tone: "danger" },
  locked: { label: "Paid \u2014 in progress", tone: "success" },
  delivered: { label: "Delivered \u2014 awaiting confirmation", tone: "warning" },
  released: { label: "Completed", tone: "success" },
  disputed: { label: "Disputed", tone: "danger" },
  refunded: { label: "Refunded", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

// ---------- seed providers + services ----------
const NOW = Date.now();
const DAY = 86_400_000;

export const SEED_PROVIDERS: SeedProvider[] = [
  { id: "sp-aurora", name: "Aurora Vale", bio: "Brand & product designer helping Pioneers ship polished visuals. Clean, modern, on time.", location: "Lisbon", joinedAt: NOW - 320 * DAY },
  { id: "sp-kato", name: "Kato Mensah", bio: "Full-stack developer building fast websites and small apps. I keep things simple and reliable.", location: "Accra", joinedAt: NOW - 210 * DAY },
  { id: "sp-lila", name: "Lila Moreno", bio: "Growth marketer focused on social content and honest, sustainable reach.", location: "Bogotá", joinedAt: NOW - 150 * DAY },
  { id: "sp-derek", name: "Derek Shaw", bio: "Business advisor. 10+ years helping small teams plan and prioritize.", location: "Manchester", joinedAt: NOW - 400 * DAY },
  { id: "sp-mira", name: "Mira Okafor", bio: "Language tutor and study coach. Patient, structured, encouraging.", location: "Lagos", joinedAt: NOW - 95 * DAY },
  { id: "sp-tomas", name: "Tomas Reyes", bio: "Reliable local help for errands, small repairs, and everyday tasks.", location: "Manila", joinedAt: NOW - 60 * DAY },
];

export const SEED_PROVIDER_MAP: Record<string, SeedProvider> = SEED_PROVIDERS.reduce(
  (acc, p) => {
    acc[p.id] = p;
    return acc;
  },
  {} as Record<string, SeedProvider>,
);

interface SeedServiceInput {
  id: string;
  ownerId: string;
  title: string;
  category: CategoryId;
  description: string;
  price: number;
  deliveryId: DeliveryId;
  images: string[];
  ageDays: number;
}

const SEED_SERVICE_INPUTS: SeedServiceInput[] = [
  {
    id: "svc-logo",
    ownerId: "sp-aurora",
    title: "Modern logo & brand mark design",
    category: "design",
    description:
      "I design a clean, memorable logo for your project or business. You get the main mark, a simple color palette, and export files ready for web and print. Two rounds of revisions included. Share a short brief and any references to get started.",
    price: 45,
    deliveryId: "1w",
    images: ["minimal logo design on paper", "brand color palette swatches", "logo mockup on business card"],
    ageDays: 4,
  },
  {
    id: "svc-poster",
    ownerId: "sp-aurora",
    title: "Social media post & poster pack",
    category: "design",
    description:
      "A set of matching graphics for your announcements — posts, stories, and a poster. Delivered in the sizes you need with editable text areas.",
    price: 25,
    deliveryId: "3d",
    images: ["social media post templates", "event poster design"],
    ageDays: 12,
  },
  {
    id: "svc-website",
    ownerId: "sp-kato",
    title: "One-page responsive website",
    category: "development",
    description:
      "A fast, mobile-friendly single-page website for your service or portfolio. Includes contact section and basic search-friendly setup. Hosting not included — I hand over clean, ready-to-deploy files.",
    price: 120,
    deliveryId: "2w",
    images: ["responsive website on phone and laptop", "clean landing page design"],
    ageDays: 2,
  },
  {
    id: "svc-bugfix",
    ownerId: "sp-kato",
    title: "Website bug fixes & small changes",
    category: "development",
    description:
      "Something broken or need a small tweak? Send me the details and I'll fix layout issues, broken links, or small features. Priced per task after a quick look.",
    price: 30,
    deliveryId: "3d",
    images: ["code editor screen", "developer fixing website"],
    ageDays: 20,
  },
  {
    id: "svc-social",
    ownerId: "sp-lila",
    title: "2-week social media content plan",
    category: "marketing",
    description:
      "A ready-to-post content calendar for two weeks: captions, hashtags, and posting times tailored to your audience. Great for launching a new service.",
    price: 40,
    deliveryId: "1w",
    images: ["content calendar plan", "social media analytics"],
    ageDays: 7,
  },
  {
    id: "svc-seo",
    ownerId: "sp-lila",
    title: "Basic SEO review for your site",
    category: "marketing",
    description:
      "I review your website and send a clear, prioritized checklist to improve how it shows up in search. Written in plain language, no jargon.",
    price: 35,
    deliveryId: "3d",
    images: ["seo report on screen", "search results ranking"],
    ageDays: 25,
  },
  {
    id: "svc-plan",
    ownerId: "sp-derek",
    title: "1-hour business strategy call",
    category: "business",
    description:
      "A focused call to talk through your goals, pricing, and next steps. You get a short written summary with clear action points afterwards.",
    price: 60,
    deliveryId: "3d",
    images: ["business strategy meeting", "notebook with plan"],
    ageDays: 5,
  },
  {
    id: "svc-pitch",
    ownerId: "sp-derek",
    title: "Pitch & proposal review",
    category: "business",
    description:
      "Send me your pitch deck or proposal and I'll give honest, structured feedback to make it clearer and more convincing.",
    price: 50,
    deliveryId: "1w",
    images: ["pitch deck slides", "proposal document review"],
    ageDays: 30,
  },
  {
    id: "svc-tutor",
    ownerId: "sp-mira",
    title: "English conversation lessons",
    category: "education",
    description:
      "Friendly one-on-one conversation practice to build confidence. Each session is tailored to your level with simple homework to keep improving.",
    price: 15,
    deliveryId: "1d",
    images: ["online language lesson", "student studying english"],
    ageDays: 3,
  },
  {
    id: "svc-study",
    ownerId: "sp-mira",
    title: "Study plan & coaching for exams",
    category: "education",
    description:
      "I build a realistic weekly study plan around your exam date and check in to keep you on track. Great for staying organized and motivated.",
    price: 28,
    deliveryId: "1w",
    images: ["study plan schedule", "exam preparation notes"],
    ageDays: 16,
  },
  {
    id: "svc-errand",
    ownerId: "sp-tomas",
    title: "Local errands & pickup help",
    category: "home",
    description:
      "Need something picked up or dropped off? I handle everyday errands reliably. Tell me what you need and where, and I'll confirm the details first.",
    price: 12,
    deliveryId: "1d",
    images: ["person running errands", "delivery bag"],
    ageDays: 6,
  },
  {
    id: "svc-assembly",
    ownerId: "sp-tomas",
    title: "Furniture assembly & small fixes",
    category: "home",
    description:
      "Flat-pack furniture assembled and small household fixes done neatly. I bring my own basic tools. Priced per job after a quick chat.",
    price: 20,
    deliveryId: "3d",
    images: ["furniture assembly tools", "assembled shelf"],
    ageDays: 40,
  },
];

export const SEED_SERVICES: Service[] = SEED_SERVICE_INPUTS.map((s) => ({
  id: s.id,
  ownerId: s.ownerId,
  ownerName: SEED_PROVIDER_MAP[s.ownerId]?.name ?? "Pioneer",
  title: s.title,
  category: s.category,
  description: s.description,
  price: s.price,
  deliveryId: s.deliveryId,
  images: s.images,
  active: true,
  createdAt: NOW - s.ageDays * DAY,
  updatedAt: NOW - s.ageDays * DAY,
}));

export const SEED_SERVICE_ID_SET = new Set<string>(SEED_SERVICES.map((s) => s.id));

// featured = a curated subset; recent = newest overall
export const FEATURED_IDS = ["svc-logo", "svc-website", "svc-plan", "svc-tutor"];

// seed incoming-request authors (simulated customers for the connected Pioneer's own listings)
export const SEED_CUSTOMER_NAMES = ["Nadia P.", "Sam O.", "Wei Chen", "Elena R."];
export const SEED_REQUEST_MESSAGES = [
  "Hi! I'm interested in this. Could you start next week? Happy to share more details.",
  "This looks great. I have a small project and a tight timeline — is that workable?",
  "Could you help with something similar to your listing? I'll send references.",
];

// ---------- providers (merge helper) ----------
export interface PublicProvider {
  id: string;
  name: string;
  bio: string;
  location: string;
  joinedAt: number;
  isMe: boolean;
}

export function getSeedProvider(id: string): SeedProvider | undefined {
  return SEED_PROVIDER_MAP[id];
}

// ---------- sanitizers ----------
function unwrap(record: any): any {
  if (record && typeof record === "object" && "blob" in record) return record.blob;
  return record;
}

export function extractItems(record: any): any[] {
  const data = unwrap(record);
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray(data.items)) return data.items;
  return [];
}

// Profile
export const DEFAULT_PROFILE: Profile = {
  piId: "",
  name: "",
  bio: "",
  location: "",
  joinedAt: 0,
};

export function sanitizeProfile(record: any): Profile {
  const data = unwrap(record);
  if (!data || typeof data !== "object") return { ...DEFAULT_PROFILE };
  return {
    piId: cleanStr(data.piId, 120),
    name: cleanStr(data.name, NAME_MAX),
    bio: cleanMultiline(data.bio, BIO_MAX),
    location: cleanStr(data.location, LOCATION_MAX),
    joinedAt: clampNum(data.joinedAt, 0, Date.now() + DAY, 0),
  };
}

export function profileToBlob(p: Profile): Record<string, unknown> {
  return { piId: p.piId, name: p.name, bio: p.bio, location: p.location, joinedAt: p.joinedAt };
}

// Service (only "me" listings persist)
export function sanitizeImages(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = cleanStr(item, 120);
    if (s) out.push(s);
    if (out.length >= MAX_IMAGES) break;
  }
  return out;
}

export function sanitizeService(raw: any): Service | null {
  if (!raw || typeof raw !== "object") return null;
  const title = cleanStr(raw.title, TITLE_MAX);
  if (!title) return null;
  const id = cleanStr(raw.id, 40) || uid();
  return {
    id,
    ownerId: cleanStr(raw.ownerId, 120) || "Pioneer",
    ownerName: cleanStr(raw.ownerName, NAME_MAX) || "Pioneer",
    title,
    category: isCategoryId(raw.category) ? raw.category : "other",
    description: cleanMultiline(raw.description, DESC_MAX),
    price: parsePrice(String(raw.price ?? 0)),
    deliveryId: isDeliveryId(raw.deliveryId) ? raw.deliveryId : "1w",
    images: sanitizeImages(raw.images),
    active: raw.active !== false,
    createdAt: clampNum(raw.createdAt, 0, Date.now() + DAY, Date.now()),
    updatedAt: clampNum(raw.updatedAt, 0, Date.now() + DAY, clampNum(raw.createdAt, 0, Date.now() + DAY, Date.now())),
  };
}

export function sanitizeListings(record: any): Service[] {
  const items = extractItems(record);
  const seen = new Set<string>();
  const out: Service[] = [];
  for (const it of items) {
    const s = sanitizeService(it);
    if (!s) continue;
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out.slice(0, LISTINGS_CAP);
}

export function listingsToBlob(items: Service[]): Record<string, unknown> {
  return { items: items.slice(0, LISTINGS_CAP) };
}

// Hire requests
const STATUS_SET = new Set<RequestStatus>(["pending", "accepted", "declined"]);
const DIRECTION_SET = new Set<RequestDirection>(["outgoing", "incoming"]);

export function sanitizeAttachments(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = cleanStr(item, 80);
    if (s) out.push(s);
    if (out.length >= 6) break;
  }
  return out;
}

export function sanitizeRequest(raw: any): HireRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const serviceTitle = cleanStr(raw.serviceTitle, TITLE_MAX);
  const message = cleanMultiline(raw.message, MESSAGE_MAX);
  if (!serviceTitle && !message) return null;
  return {
    id: cleanStr(raw.id, 40) || uid(),
    requesterPiId: cleanStr(raw.requesterPiId, 120) || cleanStr(raw.customerName, NAME_MAX) || "Pioneer",
    requesterName: cleanStr(raw.requesterName, NAME_MAX) || cleanStr(raw.customerName, NAME_MAX) || "Customer",
    providerPiId: cleanStr(raw.providerPiId, 120) || cleanStr(raw.providerId, 40),
    providerName: cleanStr(raw.providerName, NAME_MAX) || "Provider",
    providerId: cleanStr(raw.providerPiId, 120) || cleanStr(raw.providerId, 40),
    customerName: cleanStr(raw.requesterName, NAME_MAX) || cleanStr(raw.customerName, NAME_MAX) || "Customer",
    serviceId: cleanStr(raw.serviceId, 40),
    serviceTitle: serviceTitle || "Service",
    servicePrice: parsePrice(String(raw.servicePrice ?? raw.price ?? 0)),
    message,
    deadline: isValidISO(raw.deadline) ? raw.deadline : "",
    attachments: sanitizeAttachments(raw.attachments),
    status: STATUS_SET.has(raw.status) ? raw.status : "pending",
    direction: DIRECTION_SET.has(raw.direction) ? raw.direction : "outgoing",
    createdAt: clampNum(raw.createdAt, 0, Date.now() + DAY, Date.now()),
  };
}

export function sanitizeRequests(record: any): HireRequest[] {
  const items = extractItems(record);
  const seen = new Set<string>();
  const out: HireRequest[] = [];
  for (const it of items) {
    const r = sanitizeRequest(it);
    if (!r) continue;
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out.slice(0, REQUESTS_CAP);
}

export function requestsToBlob(items: HireRequest[]): Record<string, unknown> {
  return { items: items.slice(0, REQUESTS_CAP) };
}

// Persistent messages
export const MESSAGE_TEXT_MAX = 2000;

export function sanitizeMessage(raw: any): ConversationMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const text = cleanMultiline(raw.text, MESSAGE_TEXT_MAX);
  const conversationId = cleanStr(raw.conversationId, 80);
  const hireRequestId = cleanStr(raw.hireRequestId, 80);
  const customerPiId = cleanStr(raw.customerPiId, 120);
  const providerPiId = cleanStr(raw.providerPiId, 120);
  const senderPiId = cleanStr(raw.senderPiId, 120);
  if (!text || !conversationId || !hireRequestId || !customerPiId || !providerPiId || !senderPiId) return null;
  return { id: cleanStr(raw.id, 80) || uid(), conversationId, hireRequestId, serviceId: cleanStr(raw.serviceId, 80), customerPiId, providerPiId, senderPiId, text, createdAt: clampNum(raw.createdAt, 0, Date.now() + DAY, Date.now()) };
}

export function sanitizeMessages(record: any): ConversationMessage[] {
  const seen = new Set<string>();
  const out: ConversationMessage[] = [];
  for (const raw of extractItems(record)) {
    const message = sanitizeMessage(raw);
    if (message && !seen.has(message.id)) { seen.add(message.id); out.push(message); }
  }
  return out.sort((a, b) => a.createdAt - b.createdAt).slice(-400);
}

export function messagesToBlob(items: ConversationMessage[]): Record<string, unknown> {
  return { items: items.slice(-400) };
}

// Meta
export interface MetaState {
  seededReceived: boolean;
}

export const DEFAULT_META: MetaState = { seededReceived: false };

export function sanitizeMeta(record: any): MetaState {
  const data = unwrap(record);
  if (!data || typeof data !== "object") return { ...DEFAULT_META };
  return { seededReceived: data.seededReceived === true };
}

export function metaToBlob(m: MetaState): Record<string, unknown> {
  return { seededReceived: m.seededReceived };
}
