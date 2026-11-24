"use client";

// Catalogue group: Listings, Categories, Boosts.

import { useState } from "react";
import { backendApi, downloadAdminExport } from "@/lib/backend-api";
import { Button, Card, TextInput } from "../ui";
import {
  ConfirmModal,
  DataTable,
  Drawer,
  Field,
  FilterChips,
  Pagination,
  SearchInput,
  SectionHeading,
  StatusPill,
  fmtDateTime,
  fmtPi,
  fmtRelative,
  shortId,
  useAsync,
} from "./primitives";
import type { ScreenCtx } from "./types";

export function ListingsScreen({ ctx }: { ctx: ScreenCtx }) {
  const [active, setActive] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<any | null>(null);
  const [pending, setPending] = useState<null | { row: any }>(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync(
    () => backendApi.admin.listListings({ active: active === "all" ? undefined : active, search, page, perPage: 25 }, ctx.token),
    [active, search, page],
  );

  const chips = [
    { id: "all", label: "All" },
    { id: "true", label: "Active" },
    { id: "false", label: "Inactive" },
    { id: "boosted", label: "Boosted" },
  ];

  const toggle = async (reason: string) => {
    if (!pending) return;
    setBusy(true);
    try {
      await backendApi.admin.setServiceActive(pending.row.id, !pending.row.active, reason, ctx.token);
      ctx.notify(pending.row.active ? "Listing deactivated." : "Listing reactivated.", "success");
      setPending(null);
      reload();
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : "Action failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">Listings</h1>
          <p className="text-xs text-muted-foreground">Services, with views, orders and boost status</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => ctx.go("boosts")}>
          Boost ledger →
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search title, provider, category…" />
        <FilterChips options={chips} value={active} onChange={(v) => { setActive(v); setPage(1); }} />
      </div>

      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}

      <DataTable
        columns={[
          {
            key: "title",
            header: "Listing",
            render: (r: any) => (
              <div className="flex items-center gap-2">
                {r.cover_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.cover_image} alt="" className="h-9 w-9 rounded-lg object-cover" />
                ) : (
                  <div className="h-9 w-9 rounded-lg bg-secondary" />
                )}
                <span className="font-medium">{r.title}</span>
              </div>
            ),
          },
          { key: "category_label", header: "Category", render: (r: any) => r.category_label ?? r.category ?? "—" },
          { key: "provider_name", header: "Provider" },
          { key: "price", header: "Price", align: "right", render: (r: any) => fmtPi(r.price) },
          { key: "view_count", header: "Views", align: "right", render: (r: any) => r.view_count ?? 0 },
          { key: "order_count", header: "Orders", align: "right", render: (r: any) => r.order_count ?? 0 },
          {
            key: "state",
            header: "State",
            render: (r: any) => (
              <div className="flex gap-1">
                <StatusPill value={r.active ? "active" : "inactive"} />
                {r.boosted_until && new Date(r.boosted_until).getTime() > Date.now() && <StatusPill value="accent" label="boosted" />}
              </div>
            ),
          },
        ]}
        rows={data?.listings ?? []}
        rowKey={(r: any) => r.id}
        loading={loading}
        onRowClick={(r: any) => setDetail(r)}
        emptyTitle="No listings"
      />
      <Pagination page={page} perPage={25} count={data?.count ?? 0} onPage={setPage} />

      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.title ?? "Listing"}
        subtitle={detail && <span className="font-mono">{detail.id}</span>}
        footer={
          detail && (
            <Button size="sm" variant={detail.active ? "danger" : "success"} onClick={() => { setPending({ row: detail }); setDetail(null); }}>
              {detail.active ? "Deactivate listing" : "Reactivate listing"}
            </Button>
          )
        }
      >
        {detail && (
          <div className="space-y-1">
            {detail.cover_image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={detail.cover_image} alt="" className="mb-3 h-40 w-full rounded-xl object-cover" />
            )}
            <Field label="Category">{detail.category_label ?? detail.category}</Field>
            <Field label="Price">{fmtPi(detail.price)}</Field>
            <Field label="Provider">{detail.provider_name ?? detail.owner_uid}</Field>
            <Field label="Rating">{detail.rating_avg ?? "—"}</Field>
            <Field label="Views">{detail.view_count ?? 0}</Field>
            <Field label="Orders">{detail.order_count ?? 0}</Field>
            <Field label="Boosts">{detail.boost_count ?? 0}</Field>
            <Field label="Boosted until">{detail.boosted_until ? fmtDateTime(detail.boosted_until) : "—"}</Field>
            <Field label="Created">{fmtRelative(detail.created_at)}</Field>
          </div>
        )}
      </Drawer>

      <ConfirmModal
        open={Boolean(pending)}
        busy={busy}
        tone={pending?.row?.active ? "danger" : "success"}
        title={pending?.row?.active ? "Deactivate this listing?" : "Reactivate this listing?"}
        message={pending?.row?.active ? "It will be hidden from discovery immediately." : "It will return to discovery immediately."}
        requireReason
        reasonLabel="Reason (recorded in the audit log)"
        confirmLabel={pending?.row?.active ? "Deactivate" : "Reactivate"}
        onConfirm={toggle}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

export function CategoriesScreen({ ctx }: { ctx: ScreenCtx }) {
  const { data, loading, error, reload } = useAsync(() => backendApi.admin.listCategories(ctx.token), []);
  const [editing, setEditing] = useState<null | { id: string; label: string; short: string; blurb: string; hue: number; active: boolean; sort_order: number; listing_count?: number }>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      if (creating) {
        await backendApi.admin.createCategory(
          { id: editing.id, label: editing.label, short: editing.short, blurb: editing.blurb, hue: Number(editing.hue), active: editing.active, sort_order: Number(editing.sort_order) },
          ctx.token,
        );
        ctx.notify("Category created.", "success");
      } else {
        await backendApi.admin.updateCategory(editing.id, {
          label: editing.label,
          short: editing.short,
          blurb: editing.blurb,
          hue: Number(editing.hue),
          active: editing.active,
          sort_order: Number(editing.sort_order),
        }, ctx.token);
        ctx.notify("Category updated.", "success");
      }
      setEditing(null);
      setCreating(false);
      reload();
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : "Save failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">Categories</h1>
          <p className="text-xs text-muted-foreground">Service taxonomy shown to users</p>
        </div>
        <Button size="sm" onClick={() => { setCreating(true); setEditing({ id: "", label: "", short: "", blurb: "", hue: 260, active: true, sort_order: 0 }); }}>
          New category
        </Button>
      </div>

      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}

      <DataTable
        columns={[
          { key: "label", header: "Label" },
          { key: "id", header: "Id", render: (r: any) => <span className="font-mono text-xs">{r.id}</span> },
          { key: "short", header: "Short" },
          { key: "listing_count", header: "Listings", align: "right", render: (r: any) => r.listing_count ?? 0 },
          { key: "sort_order", header: "Order", align: "right" },
          { key: "active", header: "State", render: (r: any) => <StatusPill value={r.active ? "active" : "inactive"} /> },
        ]}
        rows={data?.categories ?? []}
        rowKey={(r: any) => r.id}
        loading={loading}
        onRowClick={(r: any) => { setCreating(false); setEditing({ ...r }); }}
        emptyTitle="No categories"
      />

      <Drawer
        open={Boolean(editing)}
        onClose={() => { setEditing(null); setCreating(false); }}
        title={creating ? "New category" : `Edit ${editing?.label ?? ""}`}
        footer={
          <Button size="sm" onClick={save} disabled={busy || !editing?.id || !editing?.label}>
            {busy ? "Saving…" : "Save"}
          </Button>
        }
      >
        {editing && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Id (slug)</label>
              <TextInput value={editing.id} disabled={!creating} onChange={(e) => setEditing({ ...editing, id: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Label</label>
              <TextInput value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Short</label>
              <TextInput value={editing.short} onChange={(e) => setEditing({ ...editing, short: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Blurb</label>
              <TextInput value={editing.blurb} onChange={(e) => setEditing({ ...editing, blurb: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Hue</label>
                <TextInput type="number" value={editing.hue} onChange={(e) => setEditing({ ...editing, hue: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Sort order</label>
                <TextInput type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              Active
            </label>
          </div>
        )}
      </Drawer>
    </div>
  );
}

export function BoostsScreen({ ctx }: { ctx: ScreenCtx }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activeOnly, setActiveOnly] = useState(false);
  const [pending, setPending] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync(
    () => backendApi.admin.listBoosts({ search, page, perPage: 25, active: activeOnly ? "true" : undefined }, ctx.token),
    [search, page, activeOnly],
  );

  const revoke = async (reason: string) => {
    if (!pending) return;
    setBusy(true);
    try {
      await backendApi.admin.revokeBoost(pending.id, reason, ctx.token);
      ctx.notify("Boost revoked.", "success");
      setPending(null);
      reload();
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : "Action failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">Boosts</h1>
          <p className="text-xs text-muted-foreground">Featured-listing purchases</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => downloadAdminExport("boosts", ctx.token).catch((e) => ctx.notify(e.message, "danger"))}>
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search listing, buyer, payment id…" />
        <FilterChips options={[{ id: "all", label: "All" }, { id: "active", label: "Active only" }]} value={activeOnly ? "active" : "all"} onChange={(v) => { setActiveOnly(v === "active"); setPage(1); }} />
      </div>

      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}

      <DataTable
        columns={[
          { key: "service_title", header: "Listing" },
          { key: "buyer_name", header: "Buyer" },
          { key: "amount", header: "Amount", align: "right", render: (r: any) => fmtPi(r.amount) },
          { key: "blockchain_fee", header: "Network", align: "right", render: (r: any) => fmtPi(r.blockchain_fee) },
          { key: "payment_id", header: "Payment", render: (r: any) => <span className="font-mono text-xs">{shortId(r.payment_id)}</span> },
          { key: "created_at", header: "When", render: (r: any) => fmtRelative(r.created_at) },
          {
            key: "boosted_until",
            header: "Window",
            render: (r: any) =>
              r.boosted_until && new Date(r.boosted_until).getTime() > Date.now() ? (
                <StatusPill value="active" label={`until ${fmtRelative(r.boosted_until)}`} />
              ) : (
                <span className="text-xs text-muted-foreground">expired</span>
              ),
          },
          {
            key: "actions",
            header: "",
            align: "right",
            render: (r: any) =>
              r.boosted_until && new Date(r.boosted_until).getTime() > Date.now() ? (
                <Button size="sm" variant="ghost" onClick={(e: any) => { e.stopPropagation(); setPending(r); }}>
                  Revoke
                </Button>
              ) : null,
          },
        ]}
        rows={data?.boosts ?? []}
        rowKey={(r: any) => r.id}
        loading={loading}
        emptyTitle="No boosts sold yet"
        emptyHint="Boost purchases appear here as soon as a listing is featured."
      />
      <Pagination page={page} perPage={25} count={data?.count ?? 0} onPage={setPage} />

      <ConfirmModal
        open={Boolean(pending)}
        busy={busy}
        tone="danger"
        title="Revoke this boost?"
        message={pending ? `Ends the boost window on "${pending.service_title ?? pending.service_id}" now. No Pi moves; the payment record stays.` : undefined}
        requireReason
        reasonLabel="Reason (recorded in the audit log)"
        confirmLabel="Revoke boost"
        onConfirm={revoke}
        onCancel={() => setPending(null)}
      />

      <SectionHeading>Note</SectionHeading>
      <p className="text-xs text-muted-foreground">Revoking only ends the featured window; it never refunds or reverses the Pi payment, so the ledger stays truthful.</p>
    </div>
  );
}
