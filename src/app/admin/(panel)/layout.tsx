"use client";
import { useEffect, useRef, useState, type ReactNode, type MutableRefObject } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { LangSwitch, ThemeToggle, useI18n } from "@/i18n";
import { Badge, Btn, Field, Icon, Modal, Spinner, StatusBadge, api, toast } from "@/components/ui";
import { cn } from "@/lib/format";
import Msg from "@/components/Msg";

type ApplyInfo = { pending: boolean; pendingSince: number | null; running: boolean; lastAppliedAt: number | null; lastStatus: "ok" | "warn" | "error" | null; lastDurationMs: number };

function useApplyShortcut(fn: MutableRefObject<() => void>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); fn.current(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [fn, enabled]);
}

type Me = { username: string; totpEnabled: boolean; mustChange: boolean; siteName: string; demoMode: boolean; domain: string; preview?: boolean };

const NAV: { group: string; items: { href: string; key: string; icon: string }[] }[] = [
  {
    group: "nav.overview",
    items: [
      { href: "/admin", key: "nav.dashboard", icon: "dashboard" },
      { href: "/admin/monitoring", key: "nav.monitoring", icon: "monitor" },
    ],
  },
  {
    group: "nav.business",
    items: [
      { href: "/admin/users", key: "nav.users", icon: "users" },
      { href: "/admin/subscriptions", key: "nav.subscriptions", icon: "plans" },
      { href: "/admin/payments", key: "nav.payments", icon: "wallet" },
      { href: "/admin/content", key: "nav.content", icon: "content" },
    ],
  },
  {
    group: "nav.network",
    items: [
      { href: "/admin/nodes", key: "nav.nodes", icon: "nodes" },
      { href: "/admin/protocols", key: "nav.protocols", icon: "protocols" },
      { href: "/admin/routing", key: "nav.routing", icon: "routing" },
      { href: "/admin/dns", key: "nav.dns", icon: "dns" },
      { href: "/admin/tools", key: "nav.tools", icon: "tools" },
    ],
  },
  {
    group: "nav.system",
    items: [
      { href: "/admin/security", key: "nav.security", icon: "security" },
      { href: "/admin/notifications", key: "nav.notifications", icon: "bell" },
      { href: "/admin/settings", key: "nav.settings", icon: "settings" },
    ],
  },
];

function AccountModal({ me, open, onClose, onChanged }: { me: Me; open: boolean; onClose: () => void; onChanged: () => void }) {
  const { t, tr } = useI18n();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [pw2, setPw2] = useState("");

  const call = async (body: Record<string, string>) => {
    setBusy(true);
    const r = await api<Record<string, string>>("/api/admin/account", "POST", body);
    setBusy(false);
    if (!r.ok) toast(tr(`err.${r.data.error}`, t("common.error")), "err");
    return r;
  };

  return (
    <Modal open={open} onClose={onClose} title={`${t("account.title")} — ${me.username}`} wide>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <h4 className="text-sm font-bold">{t("account.changePassword")}</h4>
          <Field label={t("account.current")}><input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field>
          <Field label={t("account.new")} hint={t("account.pwHint")}><input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
          <Btn variant="primary" loading={busy} onClick={async () => {
            const r = await call({ action: "change-password", current: cur, next });
            if (r.ok) { toast(t("common.saved")); setCur(""); setNext(""); onChanged(); }
          }}>{t("common.save")}</Btn>
        </div>
        <div className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-bold">{t("account.2fa")} <Badge tone={me.totpEnabled ? "green" : "gray"}>{me.totpEnabled ? t("common.enabled") : t("common.disabled")}</Badge></h4>
          <p className="text-xs text-muted">{t("account.2faDesc")}</p>
          {!me.totpEnabled && !setup && (
            <Btn loading={busy} onClick={async () => {
              const r = await call({ action: "2fa-setup" });
              if (r.ok) setSetup({ secret: r.data.secret, qr: await QRCode.toDataURL(r.data.url, { margin: 1, width: 190 }) });
            }}>{t("account.2faSetup")}</Btn>
          )}
          {setup && !me.totpEnabled && (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="QR" className="rounded-xl border border-line bg-white p-1" width={190} height={190} />
              <code className="block break-all rounded-lg bg-card2 p-2 text-xs" dir="ltr">{setup.secret}</code>
              <Field label={t("account.code")}><input className="input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" /></Field>
              <Btn variant="primary" loading={busy} onClick={async () => {
                const r = await call({ action: "2fa-enable", code });
                if (r.ok) { toast(t("common.saved")); setSetup(null); setCode(""); onChanged(); }
              }}>{t("account.2faEnable")}</Btn>
            </div>
          )}
          {me.totpEnabled && (
            <div className="space-y-3">
              <Field label={t("c.password")}><input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
              <Field label={t("account.code")}><input className="input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" /></Field>
              <Btn variant="danger" loading={busy} onClick={async () => {
                const r = await call({ action: "2fa-disable", password: pw2, code });
                if (r.ok) { toast(t("common.saved")); setPw2(""); setCode(""); onChanged(); }
              }}>{t("account.2faDisable")}</Btn>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function PanelLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState(false);
  const [applying, setApplying] = useState(false);
  const [steps, setSteps] = useState<{ name: string; status: string; detail?: string }[] | null>(null);
  const [applyInfo, setApplyInfo] = useState<ApplyInfo | null>(null);

  // Poll the server-side apply state so the header button shows unapplied changes / last result.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const r = await fetch("/api/admin/actions/apply-status", { method: "POST", cache: "no-store" }).catch(() => null);
      if (alive && r?.ok) setApplyInfo(await r.json());
    };
    void tick();
    const id = setInterval(tick, 8000);
    const onVis = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  const loadMe = async () => {
    const r = await fetch("/api/admin/me", { cache: "no-store" });
    if (r.status === 401) return router.replace("/admin/login");
    setMe(await r.json());
  };
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/me", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        if (r.status === 401) return router.replace("/admin/login");
        if (r.ok) setMe(await r.json());
      })
      .catch(() => {});
    return () => controller.abort();
  }, [router]);

  const applyRef = useRef<() => void>(() => {});
  useApplyShortcut(applyRef, !!me);
  if (!me)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        <Spinner />
      </div>
    );

  const current = NAV.flatMap((g) => g.items).find((i) => (i.href === "/admin" ? path === "/admin" : path.startsWith(i.href)));
  const apply = async () => {
    if (applying) return;
    setApplying(true);
    const r = await api<{ steps: { name: string; status: string; detail?: string }[]; state: ApplyInfo }>("/api/admin/actions/apply", "POST", {});
    setApplying(false);
    if (!r.ok) return toast(t("common.error"), "err");
    setSteps(r.data.steps);
    setApplyInfo(r.data.state);
    const errs = r.data.steps.filter((s) => s.status === "error").length;
    toast(errs ? `${t("common.applyFailed")} (${errs})` : t("common.applyOk"), errs ? "err" : "ok");
  };
  applyRef.current = () => void apply();
  const applyTone = applyInfo?.running || applying ? "bg-accent animate-pulse" : applyInfo?.pending ? "bg-warn animate-pulse" : applyInfo?.lastStatus === "error" ? "bg-bad" : applyInfo?.lastStatus ? "bg-ok" : "bg-muted";
  const applyTitle = `${applyInfo?.pending ? t("common.applyPending") : applyInfo?.lastStatus === "error" ? t("common.applyFailed") : t("common.applyHint")}${applyInfo?.lastAppliedAt ? ` — ${t("common.applyLast")}: ${new Date(applyInfo.lastAppliedAt).toLocaleTimeString()} (${applyInfo.lastDurationMs} ms)` : ""} · Ctrl+S`;
  const logout = async () => {
    await fetch("/api/admin/me", { method: "DELETE" });
    router.replace("/admin/login");
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link href="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl text-white" style={{ background: "linear-gradient(135deg,var(--accent),var(--accent2))" }}>
          <Icon name="bolt" size={18} />
        </span>
        <span>
          <span className="block text-base font-extrabold leading-none">{me.siteName}</span>
          <span className="text-[11px] text-muted">{me.domain}</span>
        </span>
      </Link>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="mb-1.5 px-3 text-[10.5px] font-bold uppercase tracking-wider text-muted">{t(g.group)}</div>
            {g.items.map((i) => {
              const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
              return (
                 <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors", active ? "bg-accent/12 text-accent" : "text-muted hover:bg-card2 hover:text-ink")} style={active ? { background: "color-mix(in srgb, var(--accent) 13%, transparent)" } : undefined}>
                  <Icon name={i.icon} />
                  {t(i.key)}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <a href="/" target="_blank" className="mb-1 block rounded-xl px-3 py-2 text-xs font-semibold text-muted hover:bg-card2 hover:text-ink">↗ {t("nav.publicSite")}</a>
        {!me.preview && (
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-card2 hover:text-bad">
            <Icon name="logout" />
            {t("nav.logout")}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 border-e border-line bg-card lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="fade-in absolute inset-y-0 start-0 w-72 max-w-[85vw] border-e border-line bg-card" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <div className="lg:ps-64">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-card/85 px-3 py-2.5 backdrop-blur sm:px-6">
          <button className="btn !px-2.5 lg:hidden" onClick={() => setOpen(true)} aria-label="menu"><Icon name="menu" /></button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{current ? t(current.key) : ""}</div>
            <div className="hidden items-center gap-1.5 text-[11px] text-muted sm:flex"><span className="live-dot" /> {t("common.live")}</div>
          </div>
          {me.preview && <span className="hidden md:block"><Badge tone="violet">{t("common.previewNoLogin")}</Badge></span>}
          {me.demoMode && <span className="hidden sm:block"><Badge tone="amber">{t("common.demo")}</Badge></span>}
          <Btn size="sm" variant="primary" loading={applying} onClick={apply} title={applyTitle} className="relative">
            <Icon name="bolt" size={14} /> <span className="hidden sm:inline">{applying || applyInfo?.running ? t("common.applying") : t("common.apply")}</span>
            <span className={`absolute -end-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--card)] ${applyTone}`} aria-label={applyTitle} />
          </Btn>
          <LangSwitch compact />
          <ThemeToggle />
          <button className="btn !px-2.5" onClick={() => setAccount(true)} title={t("account.title")}>
            <Icon name="users" />
          </button>
        </header>
        {me.mustChange && !me.preview && (
          <div className="mx-3 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm sm:mx-6">
            <span>⚠ {t("account.mustChange")}</span>
            <Btn size="sm" onClick={() => setAccount(true)}>{t("account.changePassword")}</Btn>
          </div>
        )}
        <main className="mx-auto max-w-[1500px] p-3 sm:p-6">{children}</main>
      </div>
      <AccountModal me={me} open={account} onClose={() => setAccount(false)} onChanged={loadMe} />
      <Modal open={!!steps} onClose={() => setSteps(null)} title={t("common.applyResult")} footer={<Btn onClick={() => setSteps(null)}>{t("common.close")}</Btn>}>
        <p className="mb-3 rounded-xl border border-line bg-card2 p-3 text-xs leading-6 text-muted">{t("common.applyExplain")}</p>
        <ul className="space-y-2 text-sm">
          {steps?.map((s) => (
            <li key={s.name} className="rounded-xl bg-card2 p-3">
              <div className="flex items-center justify-between gap-2">
                <b>{s.name}</b>
                <StatusBadge status={s.status === "applied" ? "success" : s.status === "error" ? "error" : s.status === "skipped" ? "maintenance" : "info"} />
              </div>
              {s.detail && <p className="mt-1 break-words text-xs text-muted"><Msg text={s.detail} /></p>}
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
