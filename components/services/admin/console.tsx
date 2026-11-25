"use client";

// The admin console shell.
//
// Replaces the old single-file panel: a grouped sidebar, a top bar with the
// signed-in admin and their role, role-aware navigation driven by /api/admin/me,
// and a set of screens that all speak the same design language (DataTable,
// Drawer, Kpi, toasts, confirm-with-reason). Mounted lazily by services-app.
//
// Every screen is fed a ScreenCtx carrying the Pi access token, the toast
// notifier, the two detail drawers and the section router, so screens never
// reach for context themselves.

import { useMemo, useState, type ComponentType } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { backendApi } from "@/lib/backend-api";
import { APP_NAME } from "@/lib/services/data";
import { BrandMark } from "@/components/brand";
import { Button, Card, cx } from "../ui";
import { IconActivity, IconBolt, IconCheckCircle, IconClock, IconClose, IconFlag, IconGrid, IconInbox, IconPaperclip, IconShield, IconSliders, IconStar, IconTag, IconUser, IconWallet } from "../icons";
import { ToastProvider, useToast, useAsync, StatusPill } from "./primitives";
import type { Notify, ScreenCtx, SectionId } from "./types";
import { DashboardScreen, LiveScreen } from "./screens-overview";
import { EscrowScreen, OffersScreen, OrdersScreen, PaymentsScreen } from "./screens-orders";
import { BoostsScreen, CategoriesScreen, ListingsScreen } from "./screens-catalog";
import { ConversationsScreen, DisputesScreen, ProvidersScreen, ReportsScreen, ReviewsScreen, TrustScreen, UsersScreen } from "./screens-people";
import { AnalyticsScreen, ExportsScreen, FeesScreen, RevenueScreen } from "./screens-business";
import { AdminsScreen, AuditScreen, ConfigurationScreen, HealthScreen } from "./screens-governance";
import { OrderDrawer, UserDrawer } from "./drawers";

type NavItem = { id: SectionId; label: string; hint: string; icon: ComponentType<{ className?: string }> };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { id: "overview", label: "Dashboard", hint: "Command centre", icon: IconGrid },
      { id: "live", label: "Live Operations", hint: "Real-time feed", icon: IconActivity },
    ],
  },
  {
    title: "Operations",
    items: [
      { id: "orders", label: "Orders", hint: "Hire requests", icon: IconInbox },
      { id: "escrow", label: "Escrow & Payouts", hint: "Money in flight", icon: IconWallet },
      { id: "payments", label: "Payments", hint: "Transfers & exceptions", icon: IconWallet },
      { id: "offers", label: "Offers", hint: "Negotiations", icon: IconTag },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { id: "listings", label: "Listings", hint: "Services", icon: IconGrid },
      { id: "categories", label: "Categories", hint: "Taxonomy", icon: IconSliders },
      { id: "boosts", label: "Boosts", hint: "Featured purchases", icon: IconBolt },
    ],
  },
  {
    title: "People",
    items: [
      { id: "users", label: "Users", hint: "Accounts", icon: IconUser },
      { id: "providers", label: "Providers", hint: "Ranking", icon: IconStar },
      { id: "reviews", label: "Reviews", hint: "Feedback", icon: IconStar },
      { id: "reports", label: "Reports", hint: "Moderation queue", icon: IconFlag },
      { id: "disputes", label: "Disputes", hint: "Escrow conflicts", icon: IconTag },
      { id: "conversations", label: "Conversations", hint: "Order threads", icon: IconInbox },
      { id: "trust", label: "Trust & Safety", hint: "Signals & suspensions", icon: IconTag },
    ],
  },
  {
    title: "Business",
    items: [
      { id: "revenue", label: "Revenue & P&L", hint: "Money picture", icon: IconActivity },
      { id: "fees", label: "Fees & Take Rate", hint: "Platform policy", icon: IconSliders },
      { id: "analytics", label: "Analytics", hint: "Product events", icon: IconActivity },
      { id: "exports", label: "Exports", hint: "CSV downloads", icon: IconPaperclip },
    ],
  },
  {
    title: "Governance",
    items: [
      { id: "audit", label: "Audit Log", hint: "Admin actions", icon: IconClock },
      { id: "admins", label: "Admin Users", hint: "Roles & access", icon: IconUser },
      { id: "configuration", label: "Configuration", hint: "Platform settings", icon: IconSliders },
      { id: "health", label: "System Health", hint: "Readiness", icon: IconCheckCircle },
    ],
  },
];

function screenFor(section: SectionId, ctx: ScreenCtx) {
  switch (section) {
    case "overview": return <DashboardScreen ctx={ctx} />;
    case "live": return <LiveScreen ctx={ctx} />;
    case "orders": return <OrdersScreen ctx={ctx} />;
    case "escrow": return <EscrowScreen ctx={ctx} />;
    case "payments": return <PaymentsScreen ctx={ctx} />;
    case "offers": return <OffersScreen ctx={ctx} />;
    case "listings": return <ListingsScreen ctx={ctx} />;
    case "categories": return <CategoriesScreen ctx={ctx} />;
    case "boosts": return <BoostsScreen ctx={ctx} />;
    case "users": return <UsersScreen ctx={ctx} />;
    case "providers": return <ProvidersScreen ctx={ctx} />;
    case "reviews": return <ReviewsScreen ctx={ctx} />;
    case "reports": return <ReportsScreen ctx={ctx} />;
    case "disputes": return <DisputesScreen ctx={ctx} />;
    case "conversations": return <ConversationsScreen ctx={ctx} />;
    case "trust": return <TrustScreen ctx={ctx} />;
    case "revenue": return <RevenueScreen ctx={ctx} />;
    case "fees": return <FeesScreen ctx={ctx} />;
    case "analytics": return <AnalyticsScreen ctx={ctx} />;
    case "exports": return <ExportsScreen ctx={ctx} />;
    case "audit": return <AuditScreen ctx={ctx} />;
    case "admins": return <AdminsScreen ctx={ctx} />;
    case "configuration": return <ConfigurationScreen ctx={ctx} />;
    case "health": return <HealthScreen ctx={ctx} />;
    default: return null;
  }
}

export function AdminConsole({ onExit }: { onExit: () => void }) {
  return (
    <ToastProvider>
      <ConsoleShell onExit={onExit} />
    </ToastProvider>
  );
}

function ConsoleShell({ onExit }: { onExit: () => void }) {
  const { accessToken } = usePiAuth();
  const notify = useToast().notify as Notify;
  const me = useAsync(() => (accessToken ? backendApi.admin.me(accessToken) : Promise.reject(new Error("Not authenticated"))), [accessToken], Boolean(accessToken));

  const [section, setSection] = useState<SectionId>("overview");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  const allowedSections = useMemo(() => new Set(me.data?.sections ?? []), [me.data?.sections]);

  const ctx: ScreenCtx = {
    token: accessToken ?? "",
    notify,
    role: me.data?.role ?? "readonly",
    openOrder: (id) => setOrderId(id),
    openUser: (uid) => setUserId(uid),
    go: (s) => {
      if (allowedSections.has(s)) setSection(s);
      setNavOpen(false);
    },
  };

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => allowedSections.has(i.id)) })).filter((g) => g.items.length > 0);
  const canSeeActive = allowedSections.has(section);

  return (
    <div className="fixed inset-0 z-40 flex bg-background">
      {/* Sidebar */}
      <aside className={cx(
        "absolute inset-y-0 left-0 z-30 w-60 shrink-0 border-r border-border bg-card transition-transform lg:static lg:translate-x-0",
        navOpen ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <BrandMark size={28} className="h-7 w-7 shrink-0 rounded-lg" />
            <div>
              <p className="text-sm font-bold leading-none text-foreground">{APP_NAME}</p>
              <p className="text-[10px] text-muted-foreground">Admin console</p>
            </div>
          </div>
          <button className="lg:hidden" onClick={() => setNavOpen(false)} aria-label="Close navigation">
            <IconClose className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <nav className="h-[calc(100%-3.5rem)] overflow-y-auto p-2">
          {groups.map((g) => (
            <div key={g.title} className="mb-2">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</p>
              {g.items.map((item) => {
                const activeItem = canSeeActive && section === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setSection(item.id); setNavOpen(false); }}
                    className={cx(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition",
                      activeItem ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-secondary",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {navOpen && <div className="absolute inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setNavOpen(false)} />}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open navigation">
              ☰
            </Button>
            <span className="text-sm font-semibold text-foreground">
              {groups.flatMap((g) => g.items).find((i) => i.id === section)?.label ?? "Console"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {me.data && <StatusPill value="active" label={`${me.data.role}${me.data.source === "env" ? " · env" : ""}`} />}
            <Button size="sm" variant="outline" onClick={onExit}>
              Exit console
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          {!accessToken && (
            <Card className="mx-auto mt-10 max-w-sm p-6 text-center">
              <p className="text-sm font-semibold text-foreground">Sign in with Pi to open the console</p>
              <p className="mt-1 text-xs text-muted-foreground">The admin console needs your Pi access token.</p>
            </Card>
          )}
          {accessToken && me.loading && <div className="h-32 animate-pulse rounded-xl bg-secondary/60" />}
          {accessToken && me.error && (
            <Card className="mx-auto mt-10 max-w-sm border-destructive/40 p-6 text-center">
              <p className="text-sm font-semibold text-destructive">{me.error}</p>
              <p className="mt-1 text-xs text-muted-foreground">This console is limited to platform admins.</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={onExit}>Back to {APP_NAME}</Button>
            </Card>
          )}
          {accessToken && me.data && canSeeActive && screenFor(section, ctx)}
          {accessToken && me.data && !canSeeActive && (
            <Card className="mx-auto mt-10 max-w-sm p-6 text-center text-sm text-muted-foreground">
              You do not have access to this section.
            </Card>
          )}
        </main>
      </div>

      {me.data && <OrderDrawer orderId={orderId} onClose={() => setOrderId(null)} ctx={ctx} />}
      {me.data && <UserDrawer uid={userId} onClose={() => setUserId(null)} ctx={ctx} />}
    </div>
  );
}
