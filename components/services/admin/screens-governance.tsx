"use client";

// Governance group: Audit Log, Admin Users & Roles, Configuration, System Health.

import { useState } from "react";
import { backendApi } from "@/lib/backend-api";
import { Button, Card, Pill, Select, TextInput } from "../ui";
import {
  ConfirmModal,
  DataTable,
  FilterChips,
  Kpi,
  Pagination,
  RangeSwitch,
  SectionHeading,
  StatusPill,
  fmtDateTime,
  fmtRelative,
  shortId,
  useAsync,
} from "./primitives";
import type { ScreenCtx } from "./types";

const TARGET_TYPES = ["all", "user", "service", "review", "report", "dispute", "order", "boost", "category", "settings", "admin"];

export function AuditScreen({ ctx }: { ctx: ScreenCtx }) {
  const [targetType, setTargetType] = useState("all");
  const [range, setRange] = useState("all");
  const [page, setPage] = useState(1);
  const { data, loading, error } = useAsync(
    () => backendApi.admin.listAuditEvents({ target_type: targetType === "all" ? undefined : targetType, range, page, perPage: 30 }, ctx.token),
    [targetType, range, page],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">Audit Log</h1>
          <p className="text-xs text-muted-foreground">Every admin action, including money decisions</p>
        </div>
        <RangeSwitch value={range} onChange={setRange} />
      </div>
      <FilterChips options={TARGET_TYPES.map((t) => ({ id: t, label: t === "all" ? "All" : t }))} value={targetType} onChange={(v) => { setTargetType(v); setPage(1); }} />
      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}
      <DataTable
        columns={[
          { key: "created_at", header: "When", render: (r: any) => fmtDateTime(r.created_at) },
          { key: "admin", header: "Admin", render: (r: any) => r.admin?.display_name ?? r.admin?.username ?? shortId(r.admin_uid) },
          { key: "action", header: "Action", render: (r: any) => <span className="font-medium">{r.action}</span> },
          { key: "target_type", header: "Target", render: (r: any) => <span className="text-xs">{r.target_type} · {shortId(r.target_id)}</span> },
          { key: "reason", header: "Reason", render: (r: any) => <span className="line-clamp-1 max-w-xs text-muted-foreground">{r.reason ?? "—"}</span> },
        ]}
        rows={data?.auditEvents ?? []}
        rowKey={(r: any) => r.id}
        loading={loading}
        emptyTitle="No audit events"
      />
      <Pagination page={page} perPage={30} count={data?.count ?? (data?.auditEvents?.length ?? 0)} onPage={setPage} />
    </div>
  );
}

export function AdminsScreen({ ctx }: { ctx: ScreenCtx }) {
  const { data, loading, error, reload } = useAsync(() => backendApi.admin.listAdminUsers(ctx.token), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<null | { piUid: string; name: string }>(null);
  const [form, setForm] = useState({ piUid: "", role: "support", notes: "" });
  const roles = data?.roles ?? ["owner", "ops", "finance", "support", "readonly"];

  const grant = async () => {
    if (!form.piUid.trim()) return ctx.notify("Enter a Pi uid", "danger");
    setBusy("grant");
    try {
      await backendApi.admin.grantAdmin({ piUid: form.piUid.trim(), role: form.role, notes: form.notes }, ctx.token);
      ctx.notify("Admin granted.", "success");
      setForm({ piUid: "", role: "support", notes: "" });
      reload();
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : "Failed", "danger");
    } finally {
      setBusy(null);
    }
  };

  const changeRole = async (piUid: string, role: string) => {
    setBusy(piUid);
    try {
      await backendApi.admin.updateAdminRole({ piUid, role }, ctx.token);
      ctx.notify("Role updated.", "success");
      reload();
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : "Failed", "danger");
    } finally {
      setBusy(null);
    }
  };

  const revoke = async () => {
    if (!pending) return;
    setBusy(pending.piUid);
    try {
      await backendApi.admin.revokeAdmin(pending.piUid, ctx.token);
      ctx.notify("Access revoked.", "success");
      setPending(null);
      reload();
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : "Failed", "danger");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-bold text-foreground">Admin Users &amp; Roles</h1>
        <p className="text-xs text-muted-foreground">Who can open the console, and how much they can do</p>
      </div>

      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}

      <Card className="p-4">
        <SectionHeading>Grant access</SectionHeading>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground">Pi uid</label>
            <TextInput value={form.piUid} onChange={(e) => setForm({ ...form, piUid: e.target.value })} placeholder="e.g. 31fe8579-…" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Role</label>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {roles.map((r: string) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </div>
          <Button onClick={grant} disabled={busy === "grant"}>{busy === "grant" ? "Granting…" : "Grant"}</Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          owner = everything · finance = money &amp; exports · ops = operations · support = moderation · readonly = view only.
          Admins listed in the ADMIN_PI_UIDS env var are always owners and cannot be removed here.
        </p>
      </Card>

      <DataTable
        columns={[
          { key: "name", header: "Admin", render: (r: any) => <span className="font-medium">{r.name}</span> },
          { key: "pi_uid", header: "Uid", render: (r: any) => <span className="font-mono text-xs">{shortId(r.pi_uid)}</span> },
          {
            key: "role",
            header: "Role",
            render: (r: any) =>
              r.locked ? (
                <Pill tone="primary">{r.role} · env</Pill>
              ) : (
                <Select value={r.role} disabled={busy === r.pi_uid} onChange={(e) => changeRole(r.pi_uid, e.target.value)}>
                  {roles.map((role: string) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </Select>
              ),
          },
          { key: "granted_at", header: "Granted", render: (r: any) => fmtRelative(r.granted_at) },
          { key: "last_seen_at", header: "Last seen", render: (r: any) => (r.last_seen_at ? fmtRelative(r.last_seen_at) : "—") },
          {
            key: "actions",
            header: "",
            align: "right",
            render: (r: any) =>
              r.locked ? null : (
                <Button size="sm" variant="ghost" onClick={() => setPending({ piUid: r.pi_uid, name: r.name })}>
                  Revoke
                </Button>
              ),
          },
        ]}
        rows={data?.admins ?? []}
        rowKey={(r: any) => r.pi_uid}
        loading={loading}
        emptyTitle="No admins recorded yet"
        emptyHint="Open the console as an ADMIN_PI_UIDS owner once and it will appear here."
      />

      <ConfirmModal
        open={Boolean(pending)}
        busy={Boolean(busy)}
        tone="danger"
        title={`Revoke access for ${pending?.name ?? ""}?`}
        message="They will no longer be able to open the console."
        confirmLabel="Revoke access"
        onConfirm={revoke}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

export function ConfigurationScreen({ ctx }: { ctx: ScreenCtx }) {
  const { data, loading, error, reload } = useAsync(() => backendApi.admin.getConfig(ctx.token), []);
  const [saving, setSaving] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const settings = data?.settings ?? {};
  const meta = data?.meta ?? {};
  const keys: string[] = data?.keys ?? [];

  const valueOf = (key: string) => (key in draft ? draft[key] : settings[key]);

  const save = async (key: string) => {
    setSaving(key);
    try {
      const meta = data?.meta?.[key];
      let value: unknown = valueOf(key);
      if (meta?.kind === "percent" || meta?.kind === "pi" || meta?.kind === "usd" || meta?.kind === "number") value = Number(value);
      await backendApi.admin.updateConfig(key, value, ctx.token);
      ctx.notify(`${meta?.label ?? key} updated.`, "success");
      setDraft((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
      reload();
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : "Save failed", "danger");
    } finally {
      setSaving(null);
      setConfirmKey(null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-bold text-foreground">Configuration</h1>
        <p className="text-xs text-muted-foreground">Platform settings the console can change without a redeploy</p>
      </div>

      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}

      {loading && <div className="h-24 animate-pulse rounded-lg bg-secondary/60" />}

      <div className="grid gap-3 sm:grid-cols-2">
        {keys.map((key) => {
          const m = meta[key] ?? { label: key, hint: "", kind: "number" };
          const dirty = key in draft;
          return (
            <Card key={key} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{m.label}</p>
                  <p className="text-[11px] text-muted-foreground">{m.hint}</p>
                </div>
                <Button size="sm" variant={dirty ? "primary" : "outline"} disabled={!dirty || saving === key} onClick={() => (m.kind === "bool" ? save(key) : setConfirmKey(key))}>
                  {saving === key ? "Saving…" : "Save"}
                </Button>
              </div>
              <div className="mt-2">
                {m.kind === "bool" ? (
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input type="checkbox" checked={Boolean(valueOf(key))} onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })} />
                    {valueOf(key) ? "On" : "Off"}
                  </label>
                ) : (
                  <TextInput
                    type="number"
                    step={m.kind === "percent" || m.kind === "usd" ? 0.01 : 1}
                    value={String(valueOf(key) ?? "")}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  />
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <SectionHeading>Change history</SectionHeading>
      <DataTable
        columns={[
          { key: "changed_at", header: "When", render: (r: any) => fmtDateTime(r.changed_at) },
          { key: "key", header: "Setting" },
          { key: "previous_value", header: "From", render: (r: any) => String(r.previous_value ?? "—") },
          { key: "new_value", header: "To", render: (r: any) => <span className="font-semibold">{String(r.new_value ?? "—")}</span> },
          { key: "changed_by", header: "By", render: (r: any) => <span className="font-mono text-xs">{shortId(r.changed_by)}</span> },
        ]}
        rows={data?.history ?? []}
        rowKey={(r: any) => String(r.id)}
        emptyTitle="No changes yet"
      />

      <ConfirmModal
        open={Boolean(confirmKey)}
        tone="primary"
        title={`Change ${confirmKey ? meta[confirmKey]?.label ?? confirmKey : ""}?`}
        message="The new value applies immediately to new payments and payouts."
        confirmLabel="Save change"
        busy={Boolean(saving)}
        onConfirm={() => confirmKey && save(confirmKey)}
        onCancel={() => setConfirmKey(null)}
      />
    </div>
  );
}

export function HealthScreen({ ctx }: { ctx: ScreenCtx }) {
  const { data, loading, error, reload } = useAsync(() => backendApi.admin.health(ctx.token), []);
  const okCount = (data?.checks ?? []).filter((c: any) => c.ok).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">System Health</h1>
          <p className="text-xs text-muted-foreground">Configuration, data layer and money-path readiness</p>
        </div>
        <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
          {loading ? "Checking…" : "Re-check"}
        </Button>
      </div>

      {error && <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Status" value={data?.ok ? "Healthy" : "Attention"} />
        <Kpi label="Checks passing" value={`${okCount}/${(data?.checks ?? []).length}`} />
        <Kpi label="Environment" value={data?.env?.environment ?? "—"} />
        <Kpi label="Build" value={<span className="font-mono text-base">{data?.env?.buildSha ?? "—"}</span>} />
      </div>

      <Card className="divide-y divide-border p-0">
        {(data?.checks ?? []).map((c: any) => (
          <div key={c.name} className="flex items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-2">
              <StatusPill value={c.ok ? "active" : "failed"} label={c.ok ? "ok" : "check"} />
              <span className="text-sm text-foreground">{c.name}</span>
            </div>
            <span className="text-xs text-muted-foreground">{c.detail}</span>
          </div>
        ))}
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <SectionHeading>Data-layer views</SectionHeading>
          <div className="space-y-1">
            {(data?.views ?? []).map((v: any) => (
              <div key={v.view} className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs text-foreground">{v.view}</span>
                <StatusPill value={v.ok ? "active" : "failed"} label={v.ok ? "ok" : "missing"} />
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <SectionHeading>Tables</SectionHeading>
          <div className="space-y-1">
            {(data?.tables ?? []).map((t: any) => (
              <div key={t.table} className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs text-foreground">{t.table}</span>
                <StatusPill value={t.ok ? "active" : "failed"} label={t.ok ? "ok" : "missing"} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <SectionHeading>Environment</SectionHeading>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Environment</p>
            <p className="text-foreground">{data?.env?.environment}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pi API base</p>
            <p className="truncate font-mono text-xs text-foreground">{data?.env?.platformApiBase}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Region</p>
            <p className="text-foreground">{data?.env?.region}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
