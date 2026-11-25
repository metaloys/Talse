"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import type { CategoryId, Service, TabId } from "@/lib/services/data";
import { ServicesProvider, useServices } from "@/contexts/services-context";
import { LoadingScreen, Overlay, StorageNotice, ToastHost } from "./feedback";
import { BottomNav } from "./bottom-nav";
import { HomeScreen } from "./home-screen";
import { NotificationInbox, useNotifications } from "./notifications-inbox";
import { useUnreadMessages } from "./use-unread-messages";
import { NotificationBell } from "./notification-bell";
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

/**
 * Entry links the app can be opened with. `/services/[id]` and `/providers/[id]`
 * are the share targets Batch 2 introduces; `/hire-requests/[id]` already
 * existed for notifications.
 */
export type AppDeepLink =
  | { type: "hire-request"; id: string }
  | { type: "message"; id: string }
  | { type: "service"; id: string }
  | { type: "provider"; id: string };

function AppInner({ initialDeepLink }: { initialDeepLink?: AppDeepLink | null }) {
  const { ready, storageTrouble, toasts, dismissToast, incoming, getService, pushToast, ensureService } = useServices();

  const [tab, setTab] = useState<TabId>("home");

  const notifications = useNotifications();
  const unreadMessages = useUnreadMessages();
  const [inboxOpen, setInboxOpen] = useState(false);

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
    if (!initialDeepLink) return;
    if (initialDeepLink.type === "hire-request") {
      setTab("activity");
      setInitialOpenRequestId(initialDeepLink.id);
    } else if (initialDeepLink.type === "message") {
      setTab("messages");
      setMessagesDeepLinkId(initialDeepLink.id);
    }
  }, [initialDeepLink]);

  // A thread selection is a one-shot deep-link target; clear it when the user
  // navigates away so returning to Messages doesn't force that thread.
  useEffect(() => {
    if (tab !== "messages") setMessagesDeepLinkId(null);
  }, [tab]);

  // One app_open per session, fired only once the app is actually usable.
  useEffect(() => {
    if (ready) trackAppOpen();
  }, [ready]);

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

  // Shared-listing and shared-profile links. Unlike the hire-request link these
  // need the catalogue/auth layer to be ready, so they resolve once `ready`
  // flips. The ref keeps a re-render from re-opening the overlay.
  const handledDeepLink = useRef<string | null>(null);
  useEffect(() => {
    if (!initialDeepLink || !ready) return;
    if (initialDeepLink.type === "hire-request" || initialDeepLink.type === "message") return;

    const key = `${initialDeepLink.type}:${initialDeepLink.id}`;
    if (handledDeepLink.current === key) return;
    handledDeepLink.current = key;

    let cancelled = false;
    // Consume the share URL so closing the overlay doesn't leave the app on a
    // deep-link path that reopens on the next reload.
    const clearDeepLinkUrl = () => {
      if (typeof window === "undefined") return;
      if (window.location.pathname !== "/") window.history.replaceState(null, "", "/");
    };

    if (initialDeepLink.type === "service") {
      void ensureService(initialDeepLink.id).then((svc) => {
        if (cancelled) return;
        clearDeepLinkUrl();
        if (svc) openService(svc);
        else pushToast("That listing is no longer available.", "warning");
      });
    } else {
      setProviderId(initialDeepLink.id);
      setProviderOpen(true);
      clearDeepLinkUrl();
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDeepLink, ready]);

  if (!ready) return <LoadingScreen />;
  if (adminOpen) return <AdminPanel onExit={() => setAdminOpen(false)} />;
  if (disputesOpen) return <DisputeResolution onClose={() => { setDisputesOpen(false); setDisputeRequestId(null); }} requestId={disputeRequestId ?? undefined} />;

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

  // Tap-through from the notifications inbox. Only routes we can resolve in-app
  // are handled; anything else just closes the inbox.
  const handleNotificationNavigate = (subroute: string) => {
    const msg = subroute.match(/^\/messages\/([^/?#]+)/);
    if (msg) {
      setMessagesDeepLinkId(msg[1]);
      setTab("messages");
      return;
    }
    const hire = subroute.match(/^\/hire-requests\/([^/?#]+)/);
    if (hire) {
      setInitialOpenRequestId(hire[1]);
      setTab("activity");
      return;
    }
    const svc = subroute.match(/^\/services\/([^/?#]+)/);
    if (svc) {
      void ensureService(svc[1]).then((found) => {
        if (found) openService(found);
        else pushToast("That listing is no longer available.", "warning");
      });
    }
  };

  const openNotifications = () => {
    setInboxOpen(true);
    void notifications.load().then(() => notifications.markAllSeen());
  };

  // One bell, rendered into each tab's header (top-right) so alerts live in the
  // top bar like the rest of the Pi app ecosystem and the bottom nav keeps its
  // five primary destinations.
  const notificationBell = <NotificationBell unread={notifications.unread} onClick={openNotifications} />;

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
          headerAction={notificationBell}
        />
      )}
      {tab === "search" && (
        <SearchScreen
          presetCategory={presetCategory}
          presetNonce={presetNonce}
          onOpenService={openService}
          headerAction={notificationBell}
        />
      )}
      {tab === "activity" && (
        <ActivityScreen
          onBrowse={() => setTab("search")}
          initialOpenRequestId={initialOpenRequestId}
          onOpenMessages={(requestId) => { setMessagesDeepLinkId(requestId); setTab("messages"); }}
          onViewDispute={(requestId) => { setDisputeRequestId(requestId); setDisputesOpen(true); }}
          headerAction={notificationBell}
        />
      )}
      {tab === "messages" && (
        <MessagesScreen
          initialRequestId={messagesDeepLinkId ?? undefined}
          headerAction={notificationBell}
          unreadByRequest={unreadMessages.byRequest}
          onRead={unreadMessages.refresh}
        />
      )}
      {tab === "profile" && (
        <ProfileScreen
          onCreate={openCreate}
          onEditService={openEdit}
          onOpenService={openService}
          onOpenReviews={() => setReviewsOpen(true)}
          onOpenAdmin={() => setAdminOpen(true)}
          headerAction={notificationBell}
        />
      )}

      <BottomNav
        active={tab}
        onChange={setTab}
        activityCount={incoming.filter((r) => r.status === "pending").length}
        messagesUnreadCount={unreadMessages.total}
      />

      <NotificationInbox
        open={inboxOpen}
        onClose={() => setInboxOpen(false)}
        items={notifications.items}
        onNavigate={handleNotificationNavigate}
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

export function ServicesApp({ initialDeepLink }: { initialDeepLink?: AppDeepLink | null } = {}) {
  return (
    <ServicesProvider>
      <AppInner initialDeepLink={initialDeepLink} />
    </ServicesProvider>
  );
}
