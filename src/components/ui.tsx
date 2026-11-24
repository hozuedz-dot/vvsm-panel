"use client";
import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/format";

// ---------- toast ----------
type ToastMsg = { id: number; text: string; kind: "ok" | "err" | "info" };
export function toast(text: string, kind: ToastMsg["kind"] = "ok") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("vvsm-toast", { detail: { text, kind } }));
}
export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as { text: string; kind: ToastMsg["kind"] };
      const id = Date.now() + Math.random();
      setItems((x) => [...x.slice(-3), { id, ...d }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4200);
    };
    window.addEventListener("vvsm-toast", h);
    return () => window.removeEventListener("vvsm-toast", h);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 end-4 z-[100] flex max-w-[92vw] flex-col gap-2">
      {items.map((i) => (
        <div
          key={i.id}
          className={cn(
            "fade-in pointer-events-auto rounded-xl border px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur",
            i.kind === "ok" && "border-ok/40 bg-card text-ink",
            i.kind === "err" && "border-bad/50 bg-card text-bad",
            i.kind === "info" && "border-line bg-card text-ink"
          )}
        >
          <span className={cn("me-2", i.kind === "ok" ? "text-ok" : i.kind === "err" ? "text-bad" : "text-accent")}>●</span>
          {i.text}
        </div>
      ))}
    </div>
  );
}

// ---------- primitives ----------
export function Card({ title, action, children, className, pad = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cn("card", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
          <h3 className="text-sm font-bold tracking-tight">{title}</h3>
          {action}
        </header>
      )}
      <div className={pad ? "p-4 sm:p-5" : ""}>{children}</div>
    </section>
  );
}

export function Btn({ variant = "default", size, loading, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "danger"; size?: "sm"; loading?: boolean }) {
  return (
    <button {...p} disabled={p.disabled || loading} className={cn("btn", variant === "primary" && "btn-primary", variant === "danger" && "btn-danger", size === "sm" && "btn-sm", className)}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner() {
  return <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full border transition-colors", checked ? "border-transparent bg-accent" : "border-line bg-card2", disabled && "opacity-50")}
    >
      <span className={cn("absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-all", checked ? "start-[22px]" : "start-0.5")} style={{ width: 18, height: 18 }} />
    </button>
  );
}

const TONES: Record<string, string> = {
  green: "bg-ok/15 text-ok",
  red: "bg-bad/15 text-bad",
  amber: "bg-warn/15 text-warn",
  blue: "bg-accent/15 text-accent",
  gray: "bg-muted/15 text-muted",
  violet: "bg-accent2/15 text-accent2",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={cn("badge", TONES[tone])}>{children}</span>;
}

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  active: "green", paid: "green", online: "green", clean: "green", finished: "green", success: "green", info: "blue",
  expired: "red", failed: "red", offline: "red", blocked: "red", disabled: "gray", error: "red",
  limited: "amber", pending: "amber", confirming: "blue", underpaid: "amber", maintenance: "amber", warn: "amber",
  direct: "blue", reverse: "violet", cancelled: "gray",
};
export function StatusBadge({ status }: { status: string }) {
  const { tr } = useI18n();
  return <Badge tone={STATUS_TONE[status] || "gray"}>{tr(`s.${status}`, status)}</Badge>;
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cn("card fade-in flex max-h-[92vh] w-full flex-col", wide ? "sm:max-w-3xl" : "sm:max-w-xl")} style={{ borderRadius: 20 }}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="text-base font-bold">{title}</h3>
          <button className="rounded-lg p-1 text-muted hover:text-ink" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function useCopy() {
  const { t } = useI18n();
  return useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      toast(t("common.copied"));
    },
    [t]
  );
}

export function CopyBtn({ text, label }: { text: string; label?: string }) {
  const copy = useCopy();
  const { t } = useI18n();
  return (
    <Btn size="sm" onClick={() => copy(text)} type="button">
      ⧉ {label || t("common.copy")}
    </Btn>
  );
}

export function CodeModal({ open, onClose, title, text }: { open: boolean; onClose: () => void; title: ReactNode; text: string }) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={title} wide footer={<CopyBtn text={text} label={t("common.copy")} />}>
      <pre className="max-h-[60vh] overflow-auto rounded-xl bg-card2 p-3 text-xs leading-relaxed" dir="ltr">
        {text}
      </pre>
    </Modal>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
      {tabs.map((tb) => (
        <button
          key={tb.id}
          onClick={() => onChange(tb.id)}
          className={cn("relative whitespace-nowrap px-3.5 py-2.5 text-sm font-semibold transition-colors", value === tb.id ? "text-accent" : "text-muted hover:text-ink")}
        >
          {tb.label}
          <span className={cn("absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent transition-opacity", value === tb.id ? "opacity-100" : "opacity-0")} />
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Progress({ value, tone }: { value: number; tone?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const color = tone || (v > 90 ? "var(--bad)" : v > 70 ? "var(--warn)" : "var(--accent)");
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-card2 ring-1 ring-inset ring-line">
      <div className="bar-anim h-full rounded-full" style={{ width: `${v}%`, background: color }} />
    </div>
  );
}

// ---------- data hook ----------
export function useFetch<T>(url: string | null, opts: { interval?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const urlRef = useRef(url);
  useEffect(() => { urlRef.current = url; }, [url]);
  const load = useCallback(async () => {
    const u = urlRef.current;
    if (!u) return;
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (r.status === 401 && u.startsWith("/api/admin")) {
        window.location.href = "/admin/login";
        return;
      }
      const j = await r.json();
      if (urlRef.current !== u) return;
      if (!r.ok) setError(j.error || "error");
      else {
        setData(j as T);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    if (!opts.interval) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, opts.interval);
    return () => clearInterval(id);
  }, [url, opts.interval, load]);
  return { data, error, loading, reload: load, setData };
}

export async function api<T = Record<string, unknown>>(url: string, method = "POST", body?: unknown): Promise<{ ok: boolean; data: T & { error?: string } }> {
  try {
    const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = (await r.json().catch(() => ({}))) as T & { error?: string };
    return { ok: r.ok, data };
  } catch {
    return { ok: false, data: { error: "network_error" } as T & { error?: string } };
  }
}

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "dashboard": return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
    case "monitor": return <svg {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4M6 11l3-3 3 3 4-4" /></svg>;
    case "users": return <svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.5a3.5 3.5 0 010 7M18 14.5c2.2.6 3.5 2.5 3.5 5" /></svg>;
    case "plans": return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18M7 15h4" /></svg>;
    case "wallet": return <svg {...p}><path d="M4 7a2 2 0 012-2h11v4" /><rect x="3" y="7" width="18" height="13" rx="2.5" /><circle cx="16.5" cy="13.5" r="1.2" /></svg>;
    case "nodes": return <svg {...p}><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="19" r="2.5" /><circle cx="19" cy="19" r="2.5" /><path d="M11 7.3L6 16.7M13 7.3l5 9.4M7.5 19h9" /></svg>;
    case "protocols": return <svg {...p}><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5M3 17.5l9 5 9-5" opacity=".6" /></svg>;
    case "routing": return <svg {...p}><circle cx="6" cy="5" r="2.2" /><circle cx="6" cy="19" r="2.2" /><circle cx="18" cy="12" r="2.2" /><path d="M6 7.2v9.6M8 5h4a4 4 0 014 4v.8M8 19h4a4 4 0 004-4v-.8" /></svg>;
    case "security": return <svg {...p}><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6L12 3z" /><path d="M9 12l2.2 2.2L15.5 10" /></svg>;
    case "dns": return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></svg>;
    case "tools": return <svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" opacity=".6" /><path d="M12 12l6-6" /><circle cx="12" cy="12" r="1" /></svg>;
    case "bell": return <svg {...p}><path d="M6 9a6 6 0 0112 0c0 6 2 7.5 2 7.5H4S6 15 6 9zM10 20a2 2 0 004 0" /></svg>;
    case "content": return <svg {...p}><path d="M6 3h8l5 5v13H6z" /><path d="M14 3v5h5M9 13h7M9 17h7" /></svg>;
    case "settings": return <svg {...p}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>;
    case "menu": return <svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
    case "logout": return <svg {...p}><path d="M9 4H5a1 1 0 00-1 1v14a1 1 0 001 1h4M16 8l4 4-4 4M20 12H9" /></svg>;
    case "bolt": return <svg {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="9" /></svg>;
  }
}
