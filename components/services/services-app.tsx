"use client";

import { useState, useEffect } from "react";
import type { CategoryId, Service, TabId } from "@/lib/services/data";
import { ServicesProvider, useServices } from "@/contexts/services-context";
import { LoadingScreen, StorageNotice, ToastHost } from "./feedback";
import { BottomNav } from "./bottom-nav";
import { HomeScreen } from "./home-screen";
import { SearchScreen } from "./search-screen";
import { MessagesScreen } from "./messages-screen";
import { ActivityScreen } from "./activity-screen";
import { ProfileScreen } from "./profile-screen";
import { ReviewsScreen } from "./reviews-screen";
import { ServiceDetail } from "./service-detail";
import { HireForm } from "./hire-form";
import { CreateService } from "./create-service";
import { ProviderProfile } from "./provider-profile";
import { AdminPanel } from "./admin-panel";
import { DisputeResolution } from "./dispute-resolution";
import { Overlay } from "./feedback";

function AppInner({ initialDeepLink }: { initialDeepLink?: { type: "hire-request"; id: string } | null }) {
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
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [disputesOpen, setDisputesOpen] = useState(false);
  const [disputeRequestId, setDisputeRequestId] = useState<string | null>(null);

  // Handle a minimal deep-link: if initialDeepLink.type === 'hire-request',
  // switch to the activity tab and forward the id to ActivityScreen so it
  // can expand the corresponding request if available.
  const [initialOpenRequestId, setInitialOpenRequestId] = useState<string | null>(null);
  const [messagesDeepLinkId, setMessagesDeepLinkId] = useState<string | null>(null);
  useEffect(() => {
    if (initialDeepLink && initialDeepLink.type === "hire-request") {
      setTab("activity");
      setInitialOpenRequestId(initialDeepLink.id);
    }
  }, [initialDeepLink]);

  if (!ready) return <LoadingScreen />;
  if (adminOpen) return <AdminPanel onExit={() => setAdminOpen(false)} />;
  if (disputesOpen) return <DisputeResolution onClose={() => { setDisputesOpen(false); setDisputeRequestId(null); }} requestId={disputeRequestId ?? undefined} />;

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

      {tab === "home" && (
        <HomeScreen
          onOpenService={openService}
          onOpenCategory={openCategory}
          onCreate={openCreate}
          onSeeAll={seeAll}
        />
      )}
      {tab === "search" && (
        <SearchScreen
          presetCategory={presetCategory}
          presetNonce={presetNonce}
          onOpenService={openService}
        />
      )}
      {tab === "activity" && (
        <ActivityScreen
          onBrowse={() => setTab("search")}
          initialOpenRequestId={initialOpenRequestId}
          onOpenMessages={(requestId) => { setMessagesDeepLinkId(requestId); setTab("messages"); }}
          onViewDispute={(requestId) => { setDisputeRequestId(requestId); setDisputesOpen(true); }}
        />
      )}
      {tab === "messages" && <MessagesScreen initialRequestId={messagesDeepLinkId ?? undefined} />}
      {tab === "profile" && (
        <ProfileScreen
          onCreate={openCreate}
          onEditService={openEdit}
          onOpenService={openService}
          onOpenReviews={() => setReviewsOpen(true)}
          onOpenAdmin={() => setAdminOpen(true)}
        />
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

      <Overlay open={reviewsOpen} onClose={() => setReviewsOpen(false)} title="My reviews">
        <div className="mx-auto max-w-md p-4 pb-10">
          <ReviewsScreen />
        </div>
      </Overlay>

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

export function ServicesApp({ initialDeepLink }: { initialDeepLink?: { type: "hire-request"; id: string } | null } = {}) {
  return (
    <ServicesProvider>
      <AppInner initialDeepLink={initialDeepLink} />
    </ServicesProvider>
  );
}
