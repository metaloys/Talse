"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BIO_MAX,
  CATEGORY_MAP,
  DISCLAIMER,
  LOCATION_MAX,
  NAME_MAX,
  deliveryLabel,
  formatMonthYear,
  formatPi,
  hueFromString,
  type Service,
} from "@/lib/services/data";
import { backendApi } from "@/lib/backend-api";
import { useServices } from "@/contexts/services-context";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { ConfirmSheet } from "./feedback";
import { Avatar, Button, Card, cx, EmptyState, Field, Pill, TextArea, TextInput, Toggle } from "./ui";
import {
  CategoryIcon,
  IconCalendar,
  IconEdit,
  IconInbox,
  IconPin,
  IconPlus,
  IconTrash,
} from "./icons";

export function ProfileScreen({
  onCreate,
  onEditService,
  onOpenService,
  onOpenReviews,
  onOpenAdmin,
}: {
  onCreate: () => void;
  onEditService: (s: Service) => void;
  onOpenService: (s: Service) => void;
  onOpenReviews: () => void;
  onOpenAdmin: () => void;
}) {
  const { profile, username, myListings, saveProfile, toggleServiceActive, deleteService } = useServices();
  const { accessToken, logout } = usePiAuth();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Service | null>(null);
  const [financialSummary, setFinancialSummary] = useState<{ totalSpent: number; lockedAsBuyer: number; owedToYou: number } | null>(null);
  const [financialLoading, setFinancialLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminStatusLoading, setAdminStatusLoading] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      setFinancialSummary(null);
      setFinancialLoading(false);
      setIsAdmin(false);
      setAdminStatusLoading(false);
      return;
    }

    let cancelled = false;
    setFinancialLoading(true);
    setAdminStatusLoading(true);

    void backendApi.profile
      .getFinancialSummary(accessToken)
      .then((summary) => {
        if (cancelled) return;
        setFinancialSummary({
          totalSpent: Number(summary?.totalSpent) || 0,
          lockedAsBuyer: Number(summary?.lockedAsBuyer) || 0,
          owedToYou: Number(summary?.owedToYou) || 0,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setFinancialSummary(null);
        }
      })
      .finally(() => {
        if (!cancelled) setFinancialLoading(false);
      });

    void backendApi.me
      .getAdminStatus(accessToken)
      .then((status) => {
        if (cancelled) return;
        setIsAdmin(Boolean(status?.isAdmin));
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      })
      .finally(() => {
        if (!cancelled) setAdminStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const displayName = profile.name || username;
  const joined = profile.joinedAt || Date.now();
  const ratingCount = profile.ratingCount ?? 0;
  const ratingAvg = profile.ratingAvg ?? 0;

  const startEdit = () => {
    setName(profile.name || username);
    setBio(profile.bio);
    setLocation(profile.location);
    setEditing(true);
  };

  const save = () => {
    saveProfile({ name: name.trim() || username, bio: bio.trim(), location: location.trim() });
    setEditing(false);
  };

  const activeCount = myListings.filter((s) => s.active).length;

  return (
    <div className="mx-auto max-w-md pb-24">
      <div className="ps-hero-grad px-4 pb-5 pt-4 ps-safe-top">
        <div className="flex items-start gap-3">
          <Avatar name={displayName} hue={hueFromString(displayName)} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-foreground">{displayName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Pill tone="primary">Signed in with Pi</Pill>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <IconCalendar size={13} />
                Since {formatMonthYear(joined)}
              </span>
            </div>
          </div>
          {!editing && (
            <button
              onClick={startEdit}
              aria-label="Edit profile"
              className="ps-press flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground"
            >
              <IconEdit size={16} />
            </button>
          )}
        </div>

        {!editing && (
          <>
            {profile.location && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <IconPin size={15} />
                {profile.location}
              </p>
            )}
            {profile.bio ? (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{profile.bio}</p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Add a short bio so customers know who they&apos;re working with.
              </p>
            )}
          </>
        )}
      </div>

      {!editing && (
        <>
          <div className="px-4 pt-4">
            <button
              type="button"
              onClick={onOpenReviews}
              className="ps-press flex w-full items-center justify-between rounded-2xl border border-border bg-card p-3 text-left"
            >
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Rating</p>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {ratingCount > 0 ? ratingAvg.toFixed(1) : "—"}
                </p>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <p>{ratingCount} review{ratingCount === 1 ? "" : "s"}</p>
                <p className="mt-1 text-xs text-primary">View all</p>
              </div>
            </button>
          </div>

          <div className="px-4 pt-4">
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">Financial summary</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-secondary/50 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Total earned</p>
                  <p className="mt-1 font-bold text-foreground">{formatPi(profile.totalEarned ?? 0)}</p>
                </div>
                <div className="rounded-xl bg-secondary/50 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Total spent</p>
                  <p className="mt-1 font-bold text-foreground">
                    {financialLoading ? "…" : financialSummary ? formatPi(financialSummary.totalSpent) : "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-secondary/50 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Locked as buyer</p>
                  <p className="mt-1 font-bold text-foreground">
                    {financialLoading ? "…" : financialSummary ? formatPi(financialSummary.lockedAsBuyer) : "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-secondary/50 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Owed to you</p>
                  <p className="mt-1 font-bold text-foreground">
                    {financialLoading ? "…" : financialSummary ? formatPi(financialSummary.owedToYou) : "—"}
                  </p>
                </div>
                <div className="col-span-2 rounded-xl bg-secondary/50 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Jobs completed</p>
                  <p className="mt-1 font-bold text-foreground">{profile.jobsCompleted ?? 0}</p>
                </div>
              </div>
            </Card>
          </div>

          {!adminStatusLoading && isAdmin && (
            <div className="px-4 pt-4">
              <button
                type="button"
                onClick={onOpenAdmin}
                className="ps-press flex w-full items-center justify-between rounded-2xl border border-border bg-card p-3 text-left"
              >
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Access</p>
                  <p className="mt-1 text-base font-bold text-foreground">Admin</p>
                </div>
                <span className="text-sm text-primary">Open</span>
              </button>
            </div>
          )}
        </>
      )}

      {editing ? (
        <div className="space-y-4 px-4 pt-4">
          <Field label="Name" htmlFor="pf-name" counter={`${name.length}/${NAME_MAX}`}>
            <TextInput id="pf-name" maxLength={NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </Field>
          <Field label="Location (optional)" htmlFor="pf-loc" counter={`${location.length}/${LOCATION_MAX}`}>
            <TextInput id="pf-loc" maxLength={LOCATION_MAX} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, country" />
          </Field>
          <Field label="Bio (optional)" htmlFor="pf-bio" counter={`${bio.length}/${BIO_MAX}`}>
            <TextArea id="pf-bio" rows={4} maxLength={BIO_MAX} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell people about your skills and experience…" />
          </Field>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={save}>
              Save profile
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 px-4 pt-5">
          <Button className="w-full" size="lg" onClick={onCreate}>
            <IconPlus size={18} />
            Create a service
          </Button>

          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">
                My services{myListings.length > 0 ? ` (${activeCount} active)` : ""}
              </h2>
            </div>
            {myListings.length === 0 ? (
              <EmptyState
                icon={<IconInbox size={26} />}
                title="No services yet"
                message="Publish your first service to start receiving hire requests."
                action={
                  <Button size="sm" onClick={onCreate}>
                    Create a service
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2.5">
                {myListings.map((s) => (
                  <MyServiceRow
                    key={s.id}
                    service={s}
                    onOpen={() => onOpenService(s)}
                    onEdit={() => onEditService(s)}
                    onToggle={() => { void toggleServiceActive(s.id).catch((err) => console.error("[Profile] Toggle failed:", err)); }}
                    onDelete={() => setConfirmDelete(s)}
                  />
                ))}
              </div>
            )}
          </div>

          <Card className="bg-secondary/50 p-4">
            <p className="text-[11px] leading-relaxed text-muted-foreground">{DISCLAIMER}</p>
          </Card>

          <div className="px-4 pt-2">
            <div className="rounded-2xl border border-border bg-card p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Legal</p>
              <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                <Link href="/privacy" className="font-medium text-primary underline-offset-4 hover:underline">
                  Privacy Policy
                </Link>
                <Link href="/terms" className="font-medium text-primary underline-offset-4 hover:underline">
                  Terms of Service
                </Link>
              </div>
            </div>
          </div>

          <div className="px-4 pt-4">
            <Button variant="outline" className="w-full" onClick={() => void logout()}>
              Log out
            </Button>
          </div>
        </div>
      )}

      <ConfirmSheet
        open={confirmDelete !== null}
        title="Remove this service?"
        message={confirmDelete ? `"${confirmDelete.title}" will be permanently removed.` : ""}
        confirmLabel="Remove"
        onConfirm={() => {
          if (confirmDelete) void deleteService(confirmDelete.id).catch((err) => console.error("[Profile] Delete failed:", err));
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function MyServiceRow({
  service,
  onOpen,
  onEdit,
  onToggle,
  onDelete,
}: {
  service: Service;
  onOpen: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const cat = CATEGORY_MAP[service.category];
  return (
    <Card className={cx("p-3", !service.active && "opacity-70")}>
      <div className="flex items-start gap-2">
        <button onClick={onOpen} className="ps-press min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold" style={{ color: `oklch(0.45 0.15 ${cat.hue})` }}>
              {cat.short}
            </span>
            {!service.active && <Pill tone="neutral" className="text-[10px]">Inactive</Pill>}
          </div>
          <h3 className="ps-clamp-1 mt-0.5 text-sm font-semibold text-foreground">{service.title}</h3>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-bold text-primary ps-nums">{formatPi(service.price)}</span>
            <span>·</span>
            <span>{deliveryLabel(service.deliveryId)}</span>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onEdit}
            aria-label="Edit service"
            className="ps-press flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
          >
            <IconEdit size={16} />
          </button>
          <button
            onClick={onDelete}
            aria-label="Delete service"
            className="ps-press flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
          >
            <IconTrash size={16} />
          </button>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2.5">
        <span className="text-xs font-medium text-muted-foreground">{service.active ? "Visible to customers" : "Hidden from search"}</span>
        <Toggle checked={service.active} onChange={onToggle} label="Toggle active" />
      </div>
    </Card>
  );
}
