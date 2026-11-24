"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import type { CategoryId, Service, TabId } from "@/lib/services/data";
import { ServicesProvider, useServices } from "@/contexts/services-context";
import { LoadingScreen, Overlay, StorageNotice, ToastHost } from "./feedback";
import { BottomNav } from "./bottom-nav";
import { HomeScreen } from "./home-screen";
import { track, trackAppOpen } from "@/lib/analytics";

// Everything below is behind a user action or a tab switch, so it is code-split
// out of the first-load bundle. The app boots on the Home tab only; shipping
// the admin panel, dispute tools and every other screen up front was pure
// start-up cost. `ssr: false` is safe here because the server renders only
// LoadingScreen (the app is gated on `ready`, which is false during SSR).
const SearchScreen = dynamic(() => import("./search-screen").then((m) => m.SearchScreen), { ssr: false });
const ActivityScreen = dynamic(() => import("./activity-screen").then((m) => m.ActivityScreen), { ssr: false });
const MessagesScreen = dynamic(() => import("./messages-screen").then((m) => m.MessagesScreen), { ssr: false });
const ProfileScreen = dynamic(() => import("./profile-screen").then((m) => m.ProfileScreen), { ssr: false });
const ServiceDetail = dynamic(() => import("./service-detail").then((m) => m.ServiceDetail), { ssr: false });
const HireForm = dynamic(() => import("./hire-form").then((m) => m.HireForm), { ssr: false });
const CreateService = dynamic(() => import("./create-service").then((m) => m.CreateService), { ssr: false });
const ProviderProfile = dynamic(() => import("./provider-profile").then((m) => m.ProviderProfile), { ssr: false });
const ReviewsScreen = dynamic(() => import("./reviews-screen").then((m) => m.ReviewsScreen), { ssr: false });
const AdminPanel = dynamic(() => import("./admin-panel").then((m) => m.AdminPanel), { ssr: false });
const DisputeResolution = dynamic(() => import("./dispute-resolution").then((m) => m.DisputeResolution), { ssr: false });

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

  // One app_open per session, fired only once the app is actually usable.
  useEffect(() => {
    if (ready) trackAppOpen();
  }, [ready]);

  if (!ready) return <LoadingScreen />;
  if (adminOpen) return <AdminPanel onExit={() => setAdminOpen(false)} />;
  if (disputesOpen) return <DisputeResolution onClose={() => { setDisputesOpen(false); setDisputeRequestId(null); }} requestId={disputeRequestId ?? undefined} />;

  const openService = (s: Service) => {
    track("service_view", {
      service_id: s.id,
      category: s.category,
      price: s.price,
      owner_id: s.ownerId,
      is_owner: s.ownerId === "me",
    });
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

      {/* overlays — mounted only while open, so their code is fetched on
          first use rather than shipped with the first screen */}
      {detailOpen && (
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
      )}

      {hireOpen && (
        <HireForm
          service={hireService}
          open={hireOpen}
          onClose={() => setHireOpen(false)}
          onSent={() => {
            setHireOpen(false);
            setTab("activity");
          }}
        />
      )}

      {createOpen && (
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
      )}

      <Overlay open={reviewsOpen} onClose={() => setReviewsOpen(false)} title="My reviews">
        <div className="mx-auto max-w-md p-4 pb-10">
          <ReviewsScreen />
        </div>
      </Overlay>

      {providerOpen && (
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
      )}
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
