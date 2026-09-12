"use client";

import { useEffect, useMemo, useState } from "react";
import { backendApi } from "@/lib/backend-api";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { APP_NAME, timeAgo } from "@/lib/services/data";
import { Button, Card, EmptyState, Pill, Select, TextArea, TextInput } from "./ui";
import { IconChevronRight } from "./icons";

// Local AdminTab type (previously provided by `lib/services/admin-demo-data`)
type AdminTab = "dashboard" | "users" | "services" | "jobs" | "requests" | "reviews" | "payments" | "fees" | "reports" | "categories" | "disputes" | "audit" | "settings";

type AdminNavGroup = { title: string; items: Array<{ id: AdminTab; label: string; hint: string }> };

const ADMIN_NOTICE = "Live platform data. Admin actions are audited.";
const ADMIN_GROUPS: AdminNavGroup[] = [
  {
    title: "Main",
    items: [
      { id: "dashboard", label: "Dashboard", hint: "Platform overview" },
      { id: "users", label: "Users", hint: "Accounts and access" },
      { id: "services", label: "Services", hint: "Listings review" },
      { id: "jobs", label: "Jobs", hint: "Work in progress" },
      { id: "requests", label: "Requests", hint: "Hire requests" },
    ],
  },
  {
    title: "Money",
    items: [
      { id: "payments", label: "Payments", hint: "Transactions and exceptions" },
      { id: "fees", label: "Fees", hint: "Platform policy" },
      { id: "reports", label: "Reports", hint: "Moderation queue" },
    ],
  },
  {
    title: "Trust & Safety",
    items: [
      { id: "disputes", label: "Disputes", hint: "Escrow disputes" },
      { id: "reviews", label: "Reviews", hint: "Trust and feedback" },
    ],
  },
  {
    title: "Configuration",
    items: [
      { id: "categories", label: "Categories", hint: "Service taxonomy" },
      { id: "audit", label: "Audit Log", hint: "Admin action history" },
      { id: "settings", label: "Settings", hint: "Admin preferences" },
    ],
  },
];
const ADMIN_TABS = ADMIN_GROUPS.flatMap((group) => group.items);

type DerivedStatus = "Open" | "Pending" | "Escalated" | "Resolved" | "Rejected";

const STATUS_TONES: Record<DerivedStatus, "primary" | "warning" | "success" | "danger" | "accent"> = {
  Open: "primary",
  Pending: "warning",
  Escalated: "accent",
  Resolved: "success",
  Rejected: "danger",
};

function deriveStatus(row: any): DerivedStatus {
  if (row.status === "disputed") {
    if (row.dispute_stage === "escalated") return "Escalated";
    if (row.dispute_stage === "investigating") return "Pending";
    return "Open";
  }
  if (row.resolved_favor === "buyer") return "Resolved";
  if (row.resolved_favor === "provider") return "Rejected";
  return "Open";
}

export function AdminPanel({ onExit }: { onExit: () => void }) {
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNav, setShowNav] = useState(false);
  const active = ADMIN_TABS.find((item) => item.id === tab)!;
  const [rows, setRows] = useState<Array<any>>([]);
  const [auditFilter, setAuditFilter] = useState<"All" | "user" | "service" | "review">("All");
  const [counts, setCounts] = useState<any>(null);
  const [fees, setFees] = useState<number | null>(null);
  const [settings, setSettings] = useState<string[] | null>(null);
  const [incompletePayments, setIncompletePayments] = useState<any[]>([]);
  const [completedPayments, setCompletedPayments] = useState<any[]>([]);
  const [dashboardDisputes, setDashboardDisputes] = useState<any[]>([]);
  const [dashboardReports, setDashboardReports] = useState<any[]>([]);
  const { accessToken } = usePiAuth();

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!accessToken) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }
      const token = accessToken;
      if (tab === "dashboard") {
        const [dashboardRes, disputesRes, reportsRes, incompleteRes] = await Promise.all([
          backendApi.admin.dashboard(token),
          backendApi.admin.listDisputes(token),
          backendApi.admin.listReports({}, token),
          backendApi.payments.listIncomplete(token),
        ]);
        setCounts(dashboardRes.counts);
        setDashboardDisputes(disputesRes.disputes ?? []);
        setDashboardReports(reportsRes.reports ?? []);
        setIncompletePayments(incompleteRes.incomplete ?? []);
      } else if (tab === "users") {
        const res = await backendApi.admin.listUsers({ search: query }, token);
        setRows(res.users ?? []);
      } else if (tab === "services") {
        const res = await backendApi.admin.listServices({ search: query }, token);
        setRows(res.services ?? []);
      } else if (tab === "requests") {
        const res = await backendApi.admin.listRequests({}, token);
        setRows(res.requests ?? []);
      } else if (tab === "reviews") {
        const res = await backendApi.admin.listReviews(token);
        setRows(res.reviews ?? []);
      } else if (tab === "disputes") {
        const res = await backendApi.admin.listDisputes(token);
        setRows(res.disputes ?? []);
      } else if (tab === "payments") {
        const [incompleteRes, completedRes] = await Promise.all([
          backendApi.payments.listIncomplete(token),
          backendApi.admin.listPayments(token),
        ]);
        setIncompletePayments(incompleteRes.incomplete ?? []);
        setCompletedPayments(completedRes.payments ?? []);
      } else if (tab === "fees") {
        const res = await backendApi.admin.getFees(token);
        setFees(res.fee ?? null);
      } else if (tab === "reports") {
        const res = await backendApi.admin.listReports({}, token);
        setRows(res.reports ?? []);
      } else if (tab === "audit") {
        const res = await backendApi.admin.listAuditEvents({ target_type: auditFilter === "All" ? undefined : auditFilter, page: 1, perPage: 50 }, token);
        setRows(res.auditEvents ?? []);
      } else if (tab === "categories") {
        const res = await backendApi.admin.listCategories(token);
        setRows(res.categories ?? []);
      } else if (tab === "settings") {
        const res = await backendApi.admin.getSettings(token);
        setSettings(res.adminUids ?? []);
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [tab, accessToken, auditFilter]);

  const navContent = (
    <nav aria-label="Admin sections" className="space-y-4">
      {ADMIN_GROUPS.map((group) => (
        <div key={group.title} className="space-y-2">
          <p className="px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{group.title}</p>
          <div className="space-y-1">
            {group.items.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => {
                  setTab(item.id);
                  setSaved(false);
                  setShowNav(false);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${
                  tab === item.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                <span>{item.label}</span>
                <span className="text-[10px] opacity-75">{item.hint}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <main className="min-h-screen bg-background pb-8">
      <header className="ps-hero-grad border-b border-border px-4 pb-5 pt-4 ps-safe-top">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="ps-eyebrow">{APP_NAME}</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">Admin Panel</h1>
          </div>
          <Button variant="outline" size="sm" onClick={onExit}>Exit</Button>
        </div>
        <p className="mx-auto mt-2 max-w-6xl text-xs text-muted-foreground">Platform operations workspace</p>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-4 md:px-6">
        <div className="rounded-xl bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning-foreground">{ADMIN_NOTICE}</div>

        <div className="mt-5 grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden md:block">
            <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">{navContent}</div>
          </aside>

          <div className="space-y-4">
            <div className="md:hidden">
              <button
                type="button"
                onClick={() => setShowNav((v) => !v)}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground"
              >
                <span>{active.label}</span>
                <span className="text-muted-foreground">{showNav ? "Hide" : "Menu"}</span>
              </button>
              {showNav && <div className="mt-3 rounded-2xl border border-border bg-card p-3 shadow-sm">{navContent}</div>}
            </div>

            <section aria-labelledby="admin-section-title" className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="admin-section-title" className="text-lg font-bold text-foreground">{active.label}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{active.hint}</p>
                </div>
                <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>{loading ? "Loading…" : "Refresh"}</Button>
              </div>
              {error && <p role="alert" className="mt-3 rounded-xl bg-destructive-soft px-3 py-2 text-xs text-destructive">{error}</p>}
              {tab === "dashboard" ? (
                <Dashboard counts={counts} disputes={dashboardDisputes} reports={dashboardReports} incompleteRows={incompletePayments} />
              ) : tab === "settings" ? (
                <Settings saved={saved} onSave={() => setSaved(true)} adminUids={settings} />
              ) : tab === "reports" ? (
                <ReportsView rows={rows} accessToken={accessToken} onRefresh={refresh} />
              ) : tab === "audit" ? (
                <AuditLogView rows={rows} targetFilter={auditFilter} onTargetFilterChange={setAuditFilter} onRefresh={refresh} />
              ) : tab === "categories" ? (
                <CategoriesView rows={rows} accessToken={accessToken} onRefresh={refresh} />
              ) : tab === "disputes" ? (
                <DisputesView rows={rows} accessToken={accessToken} onRefresh={refresh} />
              ) : tab === "payments" ? (
                <PaymentsView incompleteRows={incompletePayments} completedRows={completedPayments} accessToken={accessToken} onRefresh={refresh} />
              ) : (
                <ListView tab={tab} rows={rows} query={query} onQuery={setQuery} accessToken={accessToken} onRefresh={refresh} />
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function AuditLogView({ rows, targetFilter, onTargetFilterChange, onRefresh }: { rows: any[]; targetFilter: "All" | "user" | "service" | "review"; onTargetFilterChange: (value: "All" | "user" | "service" | "review") => void; onRefresh: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setOpen(null), [rows]);

  const visibleRows = rows.filter((row) => {
    if (targetFilter === "All") return true;
    return row.target_type === targetFilter;
  });

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["All", "user", "service", "review"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onTargetFilterChange(option)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${targetFilter === option ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}
          >
            {option === "All" ? "All" : option[0].toUpperCase() + option.slice(1) + "s"}
          </button>
        ))}
      </div>

      {visibleRows.length === 0 ? (
        <EmptyState title="No audit entries" message="No matching admin activity found." />
      ) : (
        visibleRows.map((row: any) => {
          const adminName = row.admin?.display_name || row.admin?.username || row.admin_uid || "Unknown admin";
          const reason = row.reason || "No reason recorded";
          return (
            <Card key={row.id} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 p-4">
                <button type="button" className="flex flex-1 items-start justify-between gap-3 text-left" onClick={() => setOpen(open === row.id ? null : row.id)}>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-foreground">{row.action}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{row.target_type} · {row.target_id}</div>
                    <div className="mt-1 text-xs text-muted-foreground">By {adminName}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[11px] text-muted-foreground">{timeAgo(new Date(row.created_at).getTime())}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{reason}</div>
                  </div>
                </button>
              </div>
              {open === row.id && (
                <div className="border-t border-border bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="rounded-lg bg-background/70 p-2"><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Admin</span><span className="mt-1 block font-medium text-foreground">{adminName}</span></div>
                    <div className="rounded-lg bg-background/70 p-2"><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">When</span><span className="mt-1 block font-medium text-foreground">{new Date(row.created_at).toLocaleString()}</span></div>
                  </div>
                  <div className="mt-3 rounded-lg bg-background/70 p-2"><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Reason</span><span className="mt-1 block text-foreground">{reason}</span></div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Previous state</p>
                      <pre className="whitespace-pre-wrap rounded-lg bg-background/80 p-2 text-[11px] text-foreground">{JSON.stringify(row.previous_state ?? {}, null, 2)}</pre>
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">New state</p>
                      <pre className="whitespace-pre-wrap rounded-lg bg-background/80 p-2 text-[11px] text-foreground">{JSON.stringify(row.new_state ?? {}, null, 2)}</pre>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}

function ReportsView({ rows, accessToken, onRefresh }: { rows: any[]; accessToken: string | null; onRefresh: () => void }) {
  const [local, setLocal] = useState(() => (rows || []).map((r) => ({ ...r })));
  useEffect(() => setLocal((rows || []).map((r) => ({ ...r }))), [rows]);

  const save = async (id: string) => {
    const item = local.find((r: any) => r.id === id);
    if (!item) return;
    try {
      if (!accessToken) return alert("Not authenticated");
      await backendApi.admin.updateReport(id, { status: item.status, admin_note: item.admin_note }, accessToken);
      await onRefresh();
    } catch (err: any) {
      alert(err?.message ?? "Failed to save");
    }
  };

  if (!rows) return <Card className="mt-4 p-4">Loading reports…</Card>;
  if (rows.length === 0) return <EmptyState title="No reports" message="No reports found." />;

  return <div className="mt-4 space-y-3">{local.map((row: any) => (
    <Card key={row.id} className="overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-foreground">{row.reason}</div>
            <div className="mt-1 text-xs text-muted-foreground">Reporter: {row.reporter?.username ?? row.reporter_uid} • Target: {row.target_type} {row.target_id}</div>
          </div>
          <Pill tone="neutral">{new Date(row.created_at).toLocaleString()}</Pill>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">{row.details}</div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <select value={row.status} onChange={(e) => setLocal(local.map((r: any) => (r.id === row.id ? { ...r, status: e.target.value } : r)))} className="rounded border px-2 py-1 text-sm">
            <option value="open">open</option>
            <option value="reviewing">reviewing</option>
            <option value="resolved">resolved</option>
            <option value="dismissed">dismissed</option>
          </select>
          <div>
            <TextArea value={row.admin_note ?? ""} onChange={(e: any) => setLocal(local.map((r: any) => (r.id === row.id ? { ...r, admin_note: e.target.value } : r)))} placeholder="Admin note" />
          </div>
        </div>
        <div className="mt-3 flex gap-2"><Button onClick={() => save(row.id)}>Save</Button><Button variant="outline" onClick={() => onRefresh()}>Refresh</Button></div>
      </div>
    </Card>
  ))}</div>;
}

function CategoriesView({ rows, accessToken, onRefresh }: { rows: any[]; accessToken: string | null; onRefresh: () => void }) {
  const [local, setLocal] = useState(() => (rows || []).map((r) => ({ ...r })));
  const [creating, setCreating] = useState(false);
  const [newCat, setNewCat] = useState({ id: "", label: "", short: "", blurb: "", hue: 0, active: true, sort_order: 0 });
  useEffect(() => setLocal((rows || []).map((r) => ({ ...r }))), [rows]);

  const save = async (id: string) => {
    const item = local.find((r: any) => r.id === id);
    if (!item) return;
    try {
      if (!accessToken) return alert("Not authenticated");
      await backendApi.admin.updateCategory(id, { label: item.label, short: item.short, blurb: item.blurb, hue: item.hue, active: item.active, sort_order: item.sort_order }, accessToken);
      await onRefresh();
    } catch (err: any) {
      alert(err?.message ?? "Failed to save");
    }
  };

  const create = async () => {
    try {
      if (!accessToken) return alert("Not authenticated");
      await backendApi.admin.createCategory(newCat as any, accessToken);
      setNewCat({ id: "", label: "", short: "", blurb: "", hue: 0, active: true, sort_order: 0 });
      setCreating(false);
      await onRefresh();
    } catch (err: any) {
      alert(err?.message ?? "Failed to create");
    }
  };

  if (!rows) return <Card className="mt-4 p-4">Loading categories…</Card>;
  return <div className="mt-4 space-y-3">
    <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold">Categories</h3><Button onClick={() => setCreating(!creating)}>{creating ? "Cancel" : "New category"}</Button></div>
    {creating && <Card className="p-4"><div className="grid gap-2"><TextInput placeholder="id" value={newCat.id} onChange={(e) => setNewCat({ ...newCat, id: e.target.value })} /><TextInput placeholder="label" value={newCat.label} onChange={(e) => setNewCat({ ...newCat, label: e.target.value })} /><TextInput placeholder="short" value={newCat.short} onChange={(e) => setNewCat({ ...newCat, short: e.target.value })} /><TextInput placeholder="blurb" value={newCat.blurb} onChange={(e) => setNewCat({ ...newCat, blurb: e.target.value })} /><TextInput placeholder="hue" value={String(newCat.hue)} onChange={(e) => setNewCat({ ...newCat, hue: Number(e.target.value) })} /><div className="mt-2"><Button onClick={create}>Create</Button></div></div></Card>}
    {local.length === 0 ? <EmptyState title="No categories" message="No categories found." /> : local.map((row: any) => (
      <Card key={row.id} className="overflow-hidden">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <input className="text-lg font-bold" value={row.label} onChange={(e: any) => setLocal(local.map((r: any) => (r.id === row.id ? { ...r, label: e.target.value } : r)))} />
              <div className="mt-1 text-xs text-muted-foreground">id: {row.id}</div>
            </div>
            <div className="text-sm">Active: <input type="checkbox" checked={row.active} onChange={(e: any) => setLocal(local.map((r: any) => (r.id === row.id ? { ...r, active: e.target.checked } : r)))} /></div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <TextInput value={row.short} onChange={(e: any) => setLocal(local.map((r: any) => (r.id === row.id ? { ...r, short: e.target.value } : r)))} />
            <TextInput value={String(row.hue)} onChange={(e: any) => setLocal(local.map((r: any) => (r.id === row.id ? { ...r, hue: Number(e.target.value) } : r)))} />
          </div>
          <div className="mt-3"><TextArea value={row.blurb} onChange={(e: any) => setLocal(local.map((r: any) => (r.id === row.id ? { ...r, blurb: e.target.value } : r)))} /></div>
          <div className="mt-3 flex gap-2"><Button onClick={() => save(row.id)}>Save</Button><Button variant="outline" onClick={() => onRefresh()}>Refresh</Button></div>
        </div>
      </Card>
    ))}
  </div>;
}

function DisputesView({ rows, accessToken, onRefresh }: { rows: any[]; accessToken: string | null; onRefresh: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<DerivedStatus | "All">("All");
  const [query, setQuery] = useState("");

  const selected = rows.find((d) => d.id === selectedId) ?? null;

  const filtered = useMemo(
    () =>
      rows.filter((d) => {
        const s = deriveStatus(d);
        const matchesStatus = statusFilter === "All" || s === statusFilter;
        const haystack = `${d.id} ${d.buyer?.username ?? ""} ${d.provider?.username ?? ""} ${d.services?.title ?? ""}`.toLowerCase();
        return matchesStatus && haystack.includes(query.toLowerCase());
      }),
    [rows, statusFilter, query]
  );

  const counts = useMemo(() => {
    const c: Record<DerivedStatus, number> = { Open: 0, Pending: 0, Escalated: 0, Resolved: 0, Rejected: 0 };
    for (const d of rows) c[deriveStatus(d)]++;
    return c;
  }, [rows]);

  const handleResolve = async (favorProvider: boolean, note: string) => {
    if (!selected || !accessToken) return;
    try {
      await backendApi.admin.resolveDispute(selected.id, { favorProvider, note: note || undefined }, accessToken);
      setSelectedId(null);
      await onRefresh();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Action failed";
      const message = /payouts? aren.t live yet|PI_APP_WALLET_SEED|wallet seed/i.test(raw)
        ? "Payouts aren't live yet — the app wallet seed is not configured."
        : raw;
      alert(message);
    }
  };

  const handleStage = async (stage: "investigating" | "escalated", note?: string) => {
    if (!selected || !accessToken) return;
    try {
      await backendApi.admin.updateDispute(selected.id, { stage, note }, accessToken);
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    }
  };

  if (selected) {
    return <Detail dispute={selected} onBack={() => setSelectedId(null)} onResolve={handleResolve} onStage={handleStage} />;
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {(["Open", "Pending", "Resolved", "Escalated"] as DerivedStatus[]).map((s) => (
          <Card key={s} className="p-3">
            <p className="text-xs text-muted-foreground">{s}</p>
            <p className="mt-1 text-xl font-bold text-foreground">{counts[s]}</p>
          </Card>
        ))}
      </div>
      <div className="flex gap-2">
        <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search disputes…" aria-label="Search disputes" />
        <Button variant="outline" onClick={onRefresh}>Refresh</Button>
      </div>
      <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as DerivedStatus | "All")} aria-label="Filter by status">
        <option>All</option>
        {(["Open", "Pending", "Escalated", "Resolved", "Rejected"] as DerivedStatus[]).map((s) => (
          <option key={s}>{s}</option>
        ))}
      </Select>
      {filtered.length === 0 ? (
        <EmptyState title="No disputes found" message="Try another search or status filter." />
      ) : (
        filtered.map((d) => (
          <button key={d.id} className="text-left" onClick={() => setSelectedId(d.id)}>
            <Card className="p-4 transition hover:border-primary">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-foreground">{d.services?.title ?? "Service"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {d.id.slice(0, 8)} · {d.buyer?.username ?? "buyer"} vs {d.provider?.username ?? "provider"}
                  </p>
                </div>
                <Pill tone={STATUS_TONES[deriveStatus(d)]}>{deriveStatus(d)}</Pill>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{d.dispute_reason || "No reason given"}</p>
            </Card>
          </button>
        ))
      )}
    </div>
  );
}

function Detail({
  dispute,
  onBack,
  onResolve,
  onStage,
}: {
  dispute: any;
  onBack: () => void;
  onResolve: (favorProvider: boolean, note: string) => void;
  onStage: (stage: "investigating" | "escalated", note?: string) => void;
}) {
  const [note, setNote] = useState(dispute.admin_note ?? "");
  const status = deriveStatus(dispute);
  const isOpenOrPending = status === "Open" || status === "Pending" || status === "Escalated";

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        ← Back to disputes
      </Button>
      <Card className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="ps-eyebrow">{dispute.id.slice(0, 8)}</p>
            <h2 className="mt-1 text-xl font-bold text-foreground">{dispute.dispute_reason || "No reason given"}</h2>
          </div>
          <Pill tone={STATUS_TONES[status]}>{status}</Pill>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Info label="Buyer" value={dispute.buyer?.display_name || dispute.buyer?.username || dispute.buyer_uid} />
          <Info label="Provider" value={dispute.provider?.display_name || dispute.provider?.username || dispute.provider_uid} />
          <Info label="Service" value={dispute.services?.title ?? "—"} />
          <Info label="Amount" value={`${dispute.amount} Pi`} />
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Details</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{dispute.dispute_details || "No further details provided."}</p>
        </div>
        {dispute.dispute_evidence?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Evidence</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {dispute.dispute_evidence.map((file: string) => (
                <Pill key={file}>{file}</Pill>
              ))}
            </div>
          </div>
        )}
      </Card>

      {isOpenOrPending ? (
        <Card className="space-y-3 p-4">
          <h3 className="font-bold text-foreground">Admin notes & outcome</h3>
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Add an internal note…" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onStage("investigating", note)}>
              Investigate
            </Button>
            <Button variant="accent" size="sm" onClick={() => onStage("escalated", note)}>
              Escalate
            </Button>
            <Button variant="success" size="sm" onClick={() => onResolve(false, note)}>
              Resolve — refund buyer
            </Button>
            <Button variant="danger" size="sm" onClick={() => onResolve(true, note)}>
              Reject — release to provider
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <p className="rounded-xl bg-success-soft p-3 text-sm text-success">
            {status === "Resolved"
              ? `Resolved: ${dispute.amount} Pi refunded to the buyer.`
              : `Rejected: ${dispute.amount} Pi released to the provider.`}
          </p>
          {dispute.admin_note && <p className="mt-2 text-xs text-muted-foreground">Note: {dispute.admin_note}</p>}
        </Card>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/60 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Dashboard({ counts, disputes, reports, incompleteRows }: { counts: any; disputes: any[]; reports: any[]; incompleteRows: any[] }) {
  if (!counts) return <Card className="mt-4 p-4">Loading metrics…</Card>;

  const openDisputes = disputes.filter((row) => deriveStatus(row) === "Open" || deriveStatus(row) === "Pending" || deriveStatus(row) === "Escalated").length;
  const openReports = reports.filter((row) => row.status === "open" || row.status === "reviewing").length;
  const stuckPayments = incompleteRows.length;
  const needsAttention = [
    ...(openDisputes > 0 ? [{ label: `${openDisputes} open disputes`, tone: "warning" as const }] : []),
    ...(openReports > 0 ? [{ label: `${openReports} open reports`, tone: "danger" as const }] : []),
    ...(stuckPayments > 0 ? [{ label: `${stuckPayments} incomplete payments`, tone: "accent" as const }] : []),
  ];

  return (
    <div className="mt-4 space-y-4">
      {needsAttention.length > 0 && (
        <Card className="border-warning/40 bg-warning-soft p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-warning-foreground">Needs attention</p>
          <ul className="mt-3 space-y-2 text-sm text-warning-foreground">
            {needsAttention.map((item) => (
              <li key={item.label} className="flex items-center justify-between gap-3 rounded-lg bg-background/40 px-2.5 py-2">
                <span>{item.label}</span>
                <span className="rounded-full bg-background/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]">{item.tone}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Users</p><p className="mt-1 text-2xl font-bold text-foreground">{counts.users}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Active services</p><p className="mt-1 text-2xl font-bold text-foreground">{counts.activeServices}</p></Card>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Open requests</p><p className="mt-1 text-2xl font-bold text-foreground">{counts.openRequests}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Completed jobs</p><p className="mt-1 text-2xl font-bold text-foreground">{counts.completedJobs}</p></Card>
      </div>
      <Card className="p-4"><p className="text-xs text-muted-foreground">Revenue</p><p className="mt-1 text-2xl font-bold text-foreground">{counts.platformFeesCollected}</p></Card>
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Network costs</p><p className="mt-1 text-2xl font-bold text-foreground">{counts.totalBlockchainFees}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Revenue after network fees</p><p className="mt-1 text-2xl font-bold text-foreground">{counts.totalPlatformNet}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Boost revenue</p><p className="mt-1 text-2xl font-bold text-foreground">{counts.boostRevenue}</p><p className="mt-1 text-xs text-muted-foreground">{counts.boostPurchaseCount} purchases</p></Card>
      </div>
    </div>
  );
}

function PaymentsView({ incompleteRows, completedRows, accessToken, onRefresh }: { incompleteRows: any[]; completedRows: any[]; accessToken: string | null; onRefresh: () => void }) {
  const recover = async (paymentId: string) => {
    if (!accessToken) return;
    await backendApi.payments.recover(paymentId, accessToken);
    await onRefresh();
  };

  return (
    <div className="mt-4 space-y-5">
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">Incomplete payments</h3>
        {incompleteRows.length === 0 ? (
          <EmptyState title="No incomplete payments" message="There are no stuck or incomplete payment records right now." />
        ) : (
          incompleteRows.map((payment: any) => (
            <Card key={payment.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-foreground">{payment.id}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Hire request: {payment.metadata?.hireRequestId ?? "n/a"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Amount: {payment.amount ?? payment.metadata?.amount ?? "n/a"}</div>
                </div>
                <Button size="sm" onClick={() => recover(payment.id)}>
                  Recover
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">Completed payments</h3>
        {completedRows.length === 0 ? (
          <EmptyState title="No completed payments" message="No completed payment records were found." />
        ) : (
          completedRows.map((payment: any) => (
            <Card key={payment.id} className="p-4">
              <div className="text-sm font-bold text-foreground">{payment.id}</div>
              <div className="mt-1 text-xs text-muted-foreground">Type: {payment.type} • {payment.txid ?? "n/a"}</div>
              <div className="mt-1 text-xs text-muted-foreground">Date: {new Date(payment.date ?? Date.now()).toLocaleString()}</div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function ListView({ tab, rows, query, onQuery, accessToken, onRefresh }: { tab: AdminTab; rows: Array<any>; query: string; onQuery: (value: string) => void; accessToken: string | null; onRefresh: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setOpen(null), [tab]);

  const toggleService = async (row: any, nextActive: boolean) => {
    if (!accessToken) {
      alert("Not authenticated");
      return;
    }

    let reason: string | undefined;
    if (!nextActive) {
      const entered = window.prompt("Optional reason for deactivation (not required):", "");
      if (entered === null) return;
      reason = entered.trim() || undefined;
    }

    try {
      const res = await fetch(`/api/admin/services/${row.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(nextActive ? { active: true } : { active: false, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to update service");
      }
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update service");
    }
  };

  const toggleUserSuspension = async (row: any, nextSuspended: boolean) => {
    if (!accessToken) {
      alert("Not authenticated");
      return;
    }

    if (nextSuspended) {
      const reason = window.prompt("Reason for suspension (required):", "");
      if (reason === null) return;
      const trimmed = reason.trim();
      if (!trimmed) {
        alert("A suspension reason is required.");
        return;
      }
      try {
        const res = await fetch(`/api/admin/users/${row.pi_uid ?? row.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ suspended: true, reason: trimmed }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to suspend user");
        }
        await onRefresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to suspend user");
      }
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${row.pi_uid ?? row.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ suspended: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to unsuspend user");
      }
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to unsuspend user");
    }
  };

  const toggleReviewVisibility = async (row: any, nextHidden: boolean) => {
    if (!accessToken) {
      alert("Not authenticated");
      return;
    }

    if (nextHidden) {
      const reason = window.prompt("Reason for hiding this review (required):", "");
      if (reason === null) return;
      const trimmed = reason.trim();
      if (!trimmed) {
        alert("A reason is required when hiding a review.");
        return;
      }
      try {
        const res = await fetch(`/api/admin/reviews/${row.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ hidden: true, reason: trimmed }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to hide review");
        }
        await onRefresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to hide review");
      }
      return;
    }

    try {
      const res = await fetch(`/api/admin/reviews/${row.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ hidden: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to restore review");
      }
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to restore review");
    }
  };

  return (
    <div className="mt-4 space-y-3">
      <TextInput value={query} onChange={(event) => onQuery(event.target.value)} placeholder={`Search ${tab}…`} aria-label={`Search ${tab}`} />
      {rows.length === 0 ? (
        <EmptyState title={`No ${tab} found`} message="No records found." />
      ) : (
        rows.map((row: any) => {
          const isServiceTab = tab === "services";
          const isUserTab = tab === "users";
          const isReviewTab = tab === "reviews";
          const isActive = row.active === true || row.active === "true";
          const isSuspended = row.suspended_at !== null && row.suspended_at !== undefined && row.suspended_at !== "";
          const isHidden = row.hidden_at !== null && row.hidden_at !== undefined && row.hidden_at !== "";
          const userKey = row.pi_uid ?? row.id;
          return (
            <Card key={row.id ?? userKey} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 p-4">
                <button
                  type="button"
                  className="flex flex-1 items-center justify-between gap-3 text-left"
                  onClick={() => setOpen(open === (row.id ?? userKey) ? null : (row.id ?? userKey))}
                >
                  <span>
                    <span className="block text-sm font-bold text-foreground">{row.title ?? row.username ?? row.display_name ?? row.provider?.username ?? row.reviewer?.username ?? row.rating ?? row.id ?? userKey}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{row.detail ?? row.suspension_reason ?? row.hidden_reason ?? row.text ?? JSON.stringify(row)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Pill tone={isUserTab && isSuspended ? "danger" : isReviewTab && isHidden ? "danger" : "neutral"}>{row.status ?? (row.type ?? (isUserTab ? (isSuspended ? "Suspended" : "Active") : isReviewTab ? (isHidden ? "Hidden" : "Visible") : ""))}</Pill>
                    <IconChevronRight className={`h-4 w-4 transition-transform ${open === (row.id ?? userKey) ? "rotate-90" : ""}`} />
                  </span>
                </button>
                {isServiceTab && (
                  <Button
                    size="sm"
                    variant={isActive ? "danger" : "primary"}
                    onClick={(event) => {
                      event.stopPropagation();
                      void toggleService(row, !isActive);
                    }}
                  >
                    {isActive ? "Deactivate" : "Reactivate"}
                  </Button>
                )}
                {isUserTab && (
                  <Button
                    size="sm"
                    variant={isSuspended ? "primary" : "danger"}
                    onClick={(event) => {
                      event.stopPropagation();
                      void toggleUserSuspension(row, !isSuspended);
                    }}
                  >
                    {isSuspended ? "Unsuspend" : "Suspend"}
                  </Button>
                )}
                {isReviewTab && (
                  <Button
                    size="sm"
                    variant={isHidden ? "primary" : "danger"}
                    onClick={(event) => {
                      event.stopPropagation();
                      void toggleReviewVisibility(row, !isHidden);
                    }}
                  >
                    {isHidden ? "Restore" : "Hide"}
                  </Button>
                )}
              </div>
              {open === (row.id ?? userKey) && (
                <div className="border-t border-border bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
                  <pre className="whitespace-pre-wrap">{JSON.stringify(row, null, 2)}</pre>
                  {isServiceTab && (
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
                      <span>Service status: {isActive ? "Active" : "Inactive"}</span>
                      <Button
                        size="sm"
                        variant={isActive ? "danger" : "primary"}
                        onClick={(event) => {
                          event.stopPropagation();
                          void toggleService(row, !isActive);
                        }}
                      >
                        {isActive ? "Deactivate" : "Reactivate"}
                      </Button>
                    </div>
                  )}
                  {isUserTab && (
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
                      <span>User status: {isSuspended ? "Suspended" : "Active"}</span>
                      <Button
                        size="sm"
                        variant={isSuspended ? "primary" : "danger"}
                        onClick={(event) => {
                          event.stopPropagation();
                          void toggleUserSuspension(row, !isSuspended);
                        }}
                      >
                        {isSuspended ? "Unsuspend" : "Suspend"}
                      </Button>
                    </div>
                  )}
                  {isReviewTab && (
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
                      <span>Review visibility: {isHidden ? "Hidden" : "Visible"}</span>
                      <Button
                        size="sm"
                        variant={isHidden ? "primary" : "danger"}
                        onClick={(event) => {
                          event.stopPropagation();
                          void toggleReviewVisibility(row, !isHidden);
                        }}
                      >
                        {isHidden ? "Restore" : "Hide"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}

function Settings({ saved, onSave, adminUids }: { saved: boolean; onSave: () => void; adminUids: string[] | null }) {
  return <Card className="mt-4 space-y-4 p-4"><div><p className="text-sm font-bold text-foreground">Admin preferences</p><p className="mt-1 text-xs text-muted-foreground">Admin UIDs (read-only)</p></div>{adminUids ? <pre className="text-xs">{adminUids.join("\n")}</pre> : <p>Loading…</p>}</Card>;
}
