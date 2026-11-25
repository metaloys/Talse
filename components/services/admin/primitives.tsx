"use client";

// Shared building blocks for the admin console: the table, the right-side
// detail drawer, toasts, confirm dialogs, KPI cards and the small SVG charts.
// Every screen uses these so the console looks and behaves consistently —
// the thing the old single-file panel could not do.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button, Card, EmptyState, Pill, cx } from "../ui";
import { IconClose, IconSearch } from "../icons";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function fmtPi(n: unknown): string {
  const v = Number(n) || 0;
  return `${v.toLocaleString(undefined, { minimumFractionDigits: v % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })} π`;
}

export function fmtUsd(n: unknown): string {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const digits = abs >= 1000 || abs === 0 ? 0 : 2;
  const body = abs.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${v < 0 ? "-" : ""}$${body}`;
}

export function fmtNum(n: unknown): string {
  return (Number(n) || 0).toLocaleString();
}

export function fmtDate(iso: unknown): string {
  if (!iso) return "—";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateTime(iso: unknown): string {
  if (!iso) return "—";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtRelative(iso: unknown): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(String(iso)).getTime();
  if (Number.isNaN(ms)) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}

export function shortId(id: unknown): string {
  return String(id ?? "").slice(0, 8);
}

export function pct(n: unknown, digits = 0): string {
  return `${((Number(n) || 0) * 100).toFixed(digits)}%`;
}

// ---------------------------------------------------------------------------
// Status pills
// ---------------------------------------------------------------------------

type Tone = "primary" | "accent" | "success" | "warning" | "danger" | "neutral";

const STATUS_TONE: Record<string, Tone> = {
  // orders
  locked: "warning",
  delivered: "accent",
  released: "success",
  refunded: "danger",
  cancelled: "neutral",
  disputed: "danger",
  // payouts
  confirmed: "success",
  pending: "warning",
  failed: "danger",
  // reports / offers
  open: "warning",
  resolved: "success",
  dismissed: "neutral",
  accepted: "success",
  declined: "danger",
  withdrawn: "neutral",
  // reviews
  hidden: "neutral",
  visible: "success",
  // generic
  active: "success",
  inactive: "neutral",
  suspended: "danger",
  investigating: "warning",
  escalated: "accent",
};

export function statusTone(status: unknown): Tone {
  const key = String(status ?? "").toLowerCase();
  return STATUS_TONE[key] ?? "neutral";
}

export function StatusPill({ value, label }: { value: unknown; label?: string }) {
  const text = label ?? String(value ?? "—");
  return <Pill tone={statusTone(value) === "neutral" ? "neutral" : statusTone(value)}>{text}</Pill>;
}

// ---------------------------------------------------------------------------
// KPI + charts
// ---------------------------------------------------------------------------

export function Kpi({
  label,
  value,
  hint,
  delta,
  deltaLabel,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  delta?: number | null;
  deltaLabel?: string;
  onClick?: () => void;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <Card
      className={cx("p-4", onClick && "cursor-pointer transition hover:border-primary/40")}
      {...(onClick ? { onClick } : {})}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      <div className="mt-1 flex items-center gap-2">
        {delta !== undefined && delta !== null && (
          <span className={cx("text-xs font-semibold", up ? "text-success" : "text-destructive")}>
            {up ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(0)}%
          </span>
        )}
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        {deltaLabel && !hint && <span className="text-xs text-muted-foreground">{deltaLabel}</span>}
      </div>
    </Card>
  );
}

/** Tiny inline area chart for a KPI or a series. */
export function Sparkline({ values, height = 36, tone = "primary" }: { values: number[]; height?: number; tone?: "primary" | "success" | "accent" }) {
  const stroke = tone === "success" ? "var(--success, #16a34a)" : tone === "accent" ? "var(--accent, #7c3aed)" : "var(--primary, #7c3aed)";
  if (!values.length) return <div style={{ height }} className="rounded bg-secondary/40" />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const w = 100;
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * w;
    const y = height - ((v - min) / span) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const area = `0,${height} ${pts.join(" ")} ${w},${height}`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <polygon points={area} fill={stroke} opacity={0.12} />
      <polyline points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Vertical bars for a funnel or a daily series. */
export function BarChart({
  data,
  height = 140,
  formatValue,
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs text-muted-foreground">{d.label}</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-secondary">
            <div className="h-full rounded bg-primary/70" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="w-16 shrink-0 text-right text-xs font-semibold text-foreground ps-nums">
            {formatValue ? formatValue(d.value) : fmtNum(d.value)}
          </span>
        </div>
      ))}
      <div className="sr-only">chart height {height}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export type Column<T> = {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  sortKey?: string;
};

export function DataTable<T extends Record<string, any>>({
  columns,
  rows,
  rowKey,
  loading,
  onRowClick,
  emptyTitle = "Nothing here yet",
  emptyHint,
  sort,
  onSort,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyHint?: string;
  sort?: { key: string; order: "asc" | "desc" };
  onSort?: (key: string) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-lg bg-secondary/60" />
        ))}
      </div>
    );
  }
  if (!rows.length) {
    return <EmptyState title={emptyTitle} message={emptyHint} />;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            {columns.map((c) => {
              const activeSort = sort && c.sortKey && sort.key === c.sortKey;
              return (
                <th
                  key={c.key}
                  className={cx(
                    "px-3 py-2 font-semibold",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                    c.sortKey && onSort && "cursor-pointer select-none hover:text-foreground",
                  )}
                  onClick={c.sortKey && onSort ? () => onSort(c.sortKey!) : undefined}
                >
                  {c.header}
                  {activeSort ? (sort!.order === "asc" ? " ▲" : " ▼") : ""}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={cx(
                "border-b border-border/60 last:border-0",
                onRowClick && "cursor-pointer hover:bg-secondary/50",
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cx(
                    "px-3 py-2 align-middle text-foreground",
                    c.align === "right" && "text-right tabular-nums",
                    c.align === "center" && "text-center",
                    c.className,
                  )}
                >
                  {c.render ? c.render(row) : (row[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar: search (debounced) + filter chips + right-hand actions
// ---------------------------------------------------------------------------

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => onChange(local), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);
  return (
    <div className="relative min-w-[200px] flex-1">
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder ?? "Search…"}
        className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
      />
    </div>
  );
}

export function FilterChips({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: string; label: string; count?: number }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cx(
            "rounded-full border px-3 py-1 text-xs font-medium transition",
            value === o.id
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
          {o.count !== undefined ? ` (${o.count})` : ""}
        </button>
      ))}
    </div>
  );
}

export function RangeSwitch({ value, onChange, options = ["7", "30", "90", "all"] }: { value: string; onChange: (v: string) => void; options?: string[] }) {
  const label = (o: string) => (o === "all" ? "All time" : `${o} days`);
  return (
    <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={cx(
            "rounded-md px-2.5 py-1 text-xs font-medium transition",
            value === o ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  perPage,
  count,
  onPage,
}: {
  page: number;
  perPage: number;
  count: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / perPage));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-2 text-xs text-muted-foreground">
      <span>
        {count} total · page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          Previous
        </Button>
        <Button size="sm" variant="outline" onClick={() => onPage(page + 1)} disabled={page >= pages}>
          Next
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------

export function Drawer({ open, onClose, title, subtitle, children, footer }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <section className="relative flex h-full w-full max-w-xl flex-col border-l border-border bg-background shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-foreground">{title}</h2>
            {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary" aria-label="Close">
            <IconClose className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <footer className="border-t border-border p-4">{footer}</footer>}
      </section>
    </div>
  );
}

/** Labelled field row used across the drawers. */
export function Field({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-2 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={cx("text-right text-sm text-foreground", mono && "font-mono text-xs")}>{children}</span>
    </div>
  );
}

export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-4 flex items-center justify-between first:mt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm modal
// ---------------------------------------------------------------------------

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  tone = "primary",
  requireReason,
  reasonLabel = "Reason",
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger" | "success";
  requireReason?: boolean;
  reasonLabel?: string;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  if (!open) return null;
  const blocked = requireReason && reason.trim().length === 0;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} aria-hidden />
      <Card className="relative z-10 w-full max-w-md p-5">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        {message && <div className="mt-2 text-sm text-muted-foreground">{message}</div>}
        {requireReason && (
          <div className="mt-3">
            <label className="text-xs font-medium text-muted-foreground">{reasonLabel}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground outline-none focus:border-primary"
              placeholder="Required — recorded in the audit log"
            />
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : tone === "success" ? "success" : "primary"} onClick={() => onConfirm(reason)} disabled={busy || blocked}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

type Toast = { id: number; message: string; tone: "success" | "danger" | "info" };
type ToastCtx = { notify: (message: string, tone?: Toast["tone"]) => void };
const ToastContext = createContext<ToastCtx>({ notify: () => {} });

export function useToast(): ToastCtx {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const notify = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-72 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto rounded-xl border px-3 py-2 text-sm shadow-lg",
              t.tone === "success"
                ? "border-success/40 bg-success/10 text-success"
                : t.tone === "danger"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-border bg-card text-foreground",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Small async-data hook used by every screen
// ---------------------------------------------------------------------------

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setLoading(true);
    setError(null);
    fn()
      .then((res) => {
        if (alive) setData(res);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled]);

  return { data, loading, error, reload: () => setNonce((n) => n + 1) };
}

export { Card, Button, Pill, cx };
