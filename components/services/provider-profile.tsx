"use client";

import {
  DISCLAIMER,
  formatMonthYear,
  hueFromString,
  type Service,
} from "@/lib/services/data";
import { useServices } from "@/contexts/services-context";
import { Overlay } from "./feedback";
import { Avatar, Card, EmptyState, Pill } from "./ui";
import { IconCalendar, IconFlag, IconInbox, IconPin } from "./icons";
import { ServiceRow } from "./service-card";

export function ProviderProfile({
  providerId,
  open,
  onClose,
  onOpenService,
}: {
  providerId: string | null;
  open: boolean;
  onClose: () => void;
  onOpenService: (service: Service) => void;
}) {
  const { getProvider, servicesByProvider, pushToast } = useServices();

  const provider = providerId ? getProvider(providerId) : undefined;
  const services = providerId ? servicesByProvider(providerId) : [];

  return (
    <Overlay open={open} onClose={onClose} title="Provider">
      {!provider ? (
        <div className="mx-auto max-w-md p-4">
          <EmptyState title="Provider not found" message="This provider is no longer available." />
        </div>
      ) : (
        <div className="mx-auto max-w-md space-y-4 p-4 pb-10">
          <div className="ps-hero-grad rounded-2xl border border-border p-5">
            <div className="flex items-center gap-3">
              <Avatar name={provider.name} hue={hueFromString(provider.name)} size={60} />
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-foreground">{provider.name}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {provider.isMe && <Pill tone="accent">You</Pill>}
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <IconCalendar size={13} />
                    Since {formatMonthYear(provider.joinedAt)}
                  </span>
                </div>
              </div>
            </div>
            {provider.location && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <IconPin size={15} />
                {provider.location}
              </p>
            )}
            {provider.bio && (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{provider.bio}</p>
            )}
          </div>

          <div>
            <h2 className="mb-2.5 px-1 text-sm font-bold text-foreground">
              Services{services.length > 0 ? ` (${services.length})` : ""}
            </h2>
            {services.length === 0 ? (
              <EmptyState
                icon={<IconInbox size={26} />}
                title="No active services"
                message="This provider has no active listings right now."
              />
            ) : (
              <div className="space-y-2.5">
                {services.map((s) => (
                  <ServiceRow key={s.id} service={s} onOpen={() => onOpenService(s)} />
                ))}
              </div>
            )}
          </div>

          {!provider.isMe && (
            <button
              onClick={() => pushToast("Report received. Thanks for helping keep Pi Services safe.", "info")}
              className="ps-press flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <IconFlag size={14} />
              Report this user
            </button>
          )}

          <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">{DISCLAIMER}</p>
        </div>
      )}
    </Overlay>
  );
}
