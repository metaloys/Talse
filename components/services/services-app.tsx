"use client";

import { useState } from "react";
import type { CategoryId, Service, TabId } from "@/lib/services/data";
import { ServicesProvider, useServices } from "@/contexts/services-context";
import { LoadingScreen, StorageNotice, ToastHost } from "./feedback";
import { BottomNav } from "./bottom-nav";
import { HomeScreen } from "./home-screen";
import { CategoriesScreen } from "./categories-screen";
import { SearchScreen } from "./search-screen";
import { ActivityScreen } from "./activity-screen";
import { ProfileScreen } from "./profile-screen";
import { ServiceDetail } from "./service-detail";
import { HireForm } from "./hire-form";
import { CreateService } from "./create-service";
import { ProviderProfile } from "./provider-profile";
import { AdminPanel } from "./admin-panel";
import { DisputeResolution } from "./dispute-resolution";

function AppInner() {
  const { ready, storageTrouble, toasts, dismissToast, incoming, getService } = useServices();

  const [tab, setTab] = useState<TabId>("home");

  // search preset (category hand-off from home/categories)
  const [presetCategory, setPresetCategory] = useState<CategoryId | "all">("all");
  const [presetNonce, setPresetNonce] = useState(0);

  // overlays
  const [detailService, setDetailService] = useState<Service | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [hireService, setHireService] = useState<Service | null>(null);
  const [hireOpen, setHireOpen] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);

  const [providerId, setProviderId] = useState<string | null>(null);
  const [providerOpen, setProviderOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [disputesOpen, setDisputesOpen] = useState(false);

  if (!ready) return <LoadingScreen />;
  if (adminOpen) return <AdminPanel onExit={() => setAdminOpen(false)} />;
  if (disputesOpen) return <DisputeResolution onClose={() => setDisputesOpen(false)} />;

  const openService = (s: Service) => {
    setDetailService(s);
    setDetailOpen(true);
  };

  const openCategory = (c: CategoryId) => {
    setPresetCategory(c);
    setPresetNonce((n) => n + 1);
    setTab("search");
  };

  const seeAll = () => {
    setPresetCategory("all");
    setPresetNonce((n) => n + 1);
    setTab("search");
  };

  const openCreate = () => {
    setEditing(null);
    setCreateOpen(true);
  };

  const openEdit = (s: Service) => {
    setEditing(s);
    setCreateOpen(true);
  };

  const openHire = (s: Service) => {
    setDetailOpen(false);
    setHireService(s);
    setHireOpen(true);
  };

  const openProvider = (id: string) => {
    setProviderId(id);
    setProviderOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <StorageNotice show={storageTrouble} />
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
      <div className="fixed right-3 top-3 z-30 flex gap-2"><button type="button" onClick={() => setDisputesOpen(true)} className="rounded-full border border-border bg-card/90 px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground shadow-sm backdrop-blur">Disputes</button><button type="button" onClick={() => setAdminOpen(true)} className="rounded-full border border-border bg-card/90 px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground shadow-sm backdrop-blur">Admin</button></div>

      {tab === "home" && (
        <HomeScreen
          onOpenService={openService}
          onOpenCategory={openCategory}
          onCreate={openCreate}
          onSeeAll={seeAll}
        />
      )}
      {tab === "categories" && <CategoriesScreen onOpenCategory={openCategory} />}
      {tab === "search" && (
        <SearchScreen
          presetCategory={presetCategory}
          presetNonce={presetNonce}
          onOpenService={openService}
        />
      )}
      {tab === "activity" && <ActivityScreen onBrowse={() => setTab("search")} />}
      {tab === "profile" && (
        <ProfileScreen onCreate={openCreate} onEditService={openEdit} onOpenService={openService} />
      )}

      <BottomNav
        active={tab}
        onChange={setTab}
        activityCount={incoming.filter((r) => r.status === "pending").length}
      />

      {/* overlays */}
      <ServiceDetail
        service={detailService}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onHire={openHire}
        onOpenProvider={(id) => {
          setDetailOpen(false);
          openProvider(id);
        }}
      />

      <HireForm
        service={hireService}
        open={hireOpen}
        onClose={() => setHireOpen(false)}
        onSent={() => {
          setHireOpen(false);
          setTab("activity");
        }}
      />

      <CreateService
        open={createOpen}
        editing={editing}
        onClose={() => setCreateOpen(false)}
        onSaved={(svc) => {
          setCreateOpen(false);
          if (svc) openService(svc);
          else setTab("profile");
        }}
      />

      <ProviderProfile
        providerId={providerId}
        open={providerOpen}
        onClose={() => setProviderOpen(false)}
        onOpenService={(s) => {
          // if opening a service from a provider that isn't loaded in detail state
          const fresh = getService(s.id) ?? s;
          setProviderOpen(false);
          openService(fresh);
        }}
      />
    </div>
  );
}

export function ServicesApp() {
  return (
    <ServicesProvider>
      <AppInner />
    </ServicesProvider>
  );
}
