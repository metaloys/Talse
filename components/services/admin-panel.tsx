"use client";

import { useState } from "react";
import { ADMIN_METRICS, ADMIN_NOTICE, ADMIN_QUEUES, ADMIN_ROWS, ADMIN_TABS, type AdminTab } from "@/lib/services/admin-demo-data";
import { Button, Card, EmptyState, Pill, TextArea, TextInput } from "./ui";
import { IconChevronRight } from "./icons";

export function AdminPanel({ onExit }: { onExit: () => void }) {
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const active = ADMIN_TABS.find((item) => item.id === tab)!;
  const rows = tab === "dashboard" || tab === "settings" ? [] : ADMIN_ROWS[tab].filter((row) => `${row.title} ${row.detail} ${row.status}`.toLowerCase().includes(query.toLowerCase()));
  const refresh = () => { setLoading(true); setError(false); window.setTimeout(() => setLoading(false), 500); };
  return <main className="min-h-screen bg-background pb-8">
    <header className="ps-hero-grad border-b border-border px-4 pb-5 pt-4 ps-safe-top">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3"><div><p className="ps-eyebrow">Pi Services</p><h1 className="mt-1 text-2xl font-bold text-foreground">Admin Panel</h1></div><Button variant="outline" size="sm" onClick={onExit}>Exit</Button></div>
      <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">Platform operations workspace</p>
    </header>
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-4">
      <div className="rounded-xl bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning-foreground">{ADMIN_NOTICE}</div>
      <nav aria-label="Admin sections" className="ps-no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">{ADMIN_TABS.map((item) => <button type="button" key={item.id} onClick={() => { setTab(item.id); setSaved(false); }} className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${tab === item.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{item.label}</button>)}</nav>
      <section aria-labelledby="admin-section-title"><div className="flex items-start justify-between gap-3"><div><h2 id="admin-section-title" className="text-lg font-bold text-foreground">{active.label}</h2><p className="mt-1 text-sm text-muted-foreground">{active.hint}</p></div><Button variant="outline" size="sm" onClick={refresh} disabled={loading}>{loading ? "Loading…" : "Refresh"}</Button></div>
        {error && <p role="alert" className="mt-3 rounded-xl bg-destructive-soft px-3 py-2 text-xs text-destructive">Demo data could not be loaded. Try again.</p>}
        {tab === "dashboard" ? <Dashboard /> : tab === "settings" ? <Settings saved={saved} onSave={() => setSaved(true)} /> : <ListView tab={tab} rows={rows} query={query} onQuery={setQuery} />}
      </section>
    </div>
  </main>;
}

function Dashboard() { return <div className="mt-4 space-y-4"><div className="grid grid-cols-2 gap-3">{ADMIN_METRICS.map(([label, value, note]) => <Card key={label} className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold text-foreground">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{note}</p></Card>)}</div><div className="space-y-2">{ADMIN_QUEUES.map((item) => <Card key={item.title} className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold text-foreground">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">Review in the future admin backend</p></div><Pill tone={item.tone as "warning" | "danger" | "neutral" | "primary"}>{item.value}</Pill></Card>)}</div></div>; }

function ListView({ tab, rows, query, onQuery }: { tab: AdminTab; rows: Array<{ id: string; title: string; detail: string; status: string }>; query: string; onQuery: (value: string) => void }) { const [open, setOpen] = useState<string | null>(null); return <div className="mt-4 space-y-3"><TextInput value={query} onChange={(event) => onQuery(event.target.value)} placeholder={`Search ${tab}…`} aria-label={`Search ${tab}`} />{rows.length === 0 ? <EmptyState title={`No ${tab} found`} message="This frontend view has no matching demo records." /> : rows.map((row) => <Card key={row.id} className="overflow-hidden"><button type="button" className="flex w-full items-center justify-between gap-3 p-4 text-left" onClick={() => setOpen(open === row.id ? null : row.id)}><span><span className="block text-sm font-bold text-foreground">{row.title}</span><span className="mt-1 block text-xs text-muted-foreground">{row.detail}</span></span><span className="flex items-center gap-2"><Pill tone="neutral">{row.status}</Pill><IconChevronRight className={`h-4 w-4 transition-transform ${open === row.id ? "rotate-90" : ""}`} /></span></button>{open === row.id && <div className="border-t border-border bg-secondary/40 px-4 py-3 text-xs text-muted-foreground"><p>Demo record ID: {row.id}</p><p className="mt-1">Future backend fields and permissions will appear here.</p></div>}</Card>)}</div>; }

function Settings({ saved, onSave }: { saved: boolean; onSave: () => void }) { return <Card className="mt-4 space-y-4 p-4"><div><p className="text-sm font-bold text-foreground">Admin preferences</p><p className="mt-1 text-xs text-muted-foreground">Frontend-only settings placeholder.</p></div><TextArea rows={3} placeholder="Internal note (not saved to backend)" /><Button onClick={onSave}>{saved ? "Saved in this session" : "Save preference"}</Button>{saved && <p role="status" className="text-xs text-success">Preference saved in this frontend session only.</p>}</Card>; }
