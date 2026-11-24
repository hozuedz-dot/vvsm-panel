"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n";
import PublicShell from "@/components/PublicShell";
import Qr from "@/components/Qr";
import { AppButtons, LinkList, UsageBar } from "@/components/SubBlocks";
import { Btn, Card, CopyBtn, Field, Spinner, StatusBadge, Tabs, api, toast, useFetch } from "@/components/ui";
import DataTable from "@/components/DataTable";
import { cn, daysLeft, formatBytes, formatDate } from "@/lib/format";

function Login({ onDone }: { onDone: () => void }) {
  const { t, tr } = useI18n();
  const [mode, setMode] = useState("pw");
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [k, setK] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await api("/api/portal/login", "POST", mode === "pw" ? { username: u, password: p } : { key: k });
    setBusy(false);
    if (!r.ok) return toast(tr(`err.${r.data.error}`, t("common.error")), "err");
    onDone();
  };
  return (
    <div className="mx-auto max-w-md">
      <div className="card fade-in space-y-4 p-6 sm:p-8">
        <div className="text-center"><h1 className="text-2xl font-extrabold">{t("portal.loginTitle")}</h1><p className="mt-1 text-sm text-muted">{t("portal.loginSub")}</p></div>
        <Tabs value={mode} onChange={setMode} tabs={[{ id: "pw", label: t("portal.byPassword") }, { id: "key", label: t("portal.byKey") }]} />
        <form onSubmit={submit} className="space-y-4">
          {mode === "pw" ? (
            <>
              <Field label={t("c.username")}><input className="input" value={u} onChange={(e) => setU(e.target.value)} dir="ltr" autoComplete="username" required /></Field>
              <Field label={t("c.password")}><input className="input" type="password" value={p} onChange={(e) => setP(e.target.value)} dir="ltr" autoComplete="current-password" required /></Field>
            </>
          ) : (
            <Field label={t("portal.key")} hint={t("portal.keyHint")}><input className="input" value={k} onChange={(e) => setK(e.target.value)} dir="ltr" placeholder="https://vvsm.online/sub/…" required /></Field>
          )}
          <Btn variant="primary" className="w-full !py-2.5" type="submit" loading={busy}>{t("login.submit")}</Btn>
        </form>
        <p className="text-center text-xs text-muted">{t("portal.noAccount")} <a className="font-semibold text-accent" href="/buy">{t("land.buy")}</a></p>
      </div>
    </div>
  );
}

function Dashboard({ me, reload, onLogout }: { me: any; reload: () => void; onLogout: () => void }) {
  const { t, tr } = useI18n();
  const router = useRouter();
  const { data: pub } = useFetch<any>("/api/public/plans");
  const [plan, setPlan] = useState<number | null>(null);
  const [cur, setCur] = useState("");
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState("");
  const days = daysLeft(me.expiresAt);
  const token = String(me.subUrl).split("/").pop() || "";
  const plans: any[] = pub?.plans || [];
  useEffect(() => {
    if (plans.length && plan === null) setPlan(plans.find((p) => p.id === me.plan?.id)?.id || plans[0].id);
  }, [plans, plan, me.plan]);
  useEffect(() => {
    if (pub?.payment?.currencies?.length && !cur) setCur(pub.payment.currencies[0].id);
  }, [pub, cur]);

  const renew = async () => {
    if (!plan || !cur) return;
    setBusy(true);
    const r = await api<{ id: string }>("/api/public/orders", "POST", { kind: "renew", planId: plan, currency: cur });
    setBusy(false);
    if (!r.ok) return toast(tr(`err.${r.data.error}`, t("common.error")), "err");
    router.push(`/pay/${r.data.id}`);
  };

  return (
    <div className="space-y-5">
      <div className="card fade-in relative overflow-hidden p-5 sm:p-7">
        <div className="pointer-events-none absolute -top-24 end-0 h-60 w-60 rounded-full opacity-25 blur-3xl" style={{ background: "radial-gradient(closest-side,var(--accent2),transparent)" }} />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-muted">{t("portal.welcome")}</p>
            <h1 className="mt-1 text-2xl font-extrabold">{me.username}</h1>
            <div className="mt-2 flex items-center gap-2"><StatusBadge status={me.status === "active" && days !== null && days < 0 ? "expired" : me.status} />{me.plan && <span className="text-sm text-muted">{tr(`plan.name.${me.plan.name}`, me.plan.name)}</span>}</div>
          </div>
          {!me.preview && <Btn size="sm" onClick={onLogout}>{t("nav.logout")}</Btn>}
        </div>
        <div className="relative mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex justify-between text-sm"><span className="text-muted">{t("sub.traffic")}</span><b dir="ltr">{formatBytes(me.used)} / {me.limit ? formatBytes(me.limit) : "∞"}</b></div>
            <UsageBar used={me.used} limit={me.limit} color="var(--accent)" track="bg-card2" />
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-sm"><span className="text-muted">{t("sub.expires")}</span><b>{me.expiresAt ? formatDate(me.expiresAt) : "∞"}</b></div>
            <p className={cn("text-sm font-semibold", days !== null && days < 4 ? "text-bad" : "text-ok")}>{days === null ? "" : days >= 0 ? t("sub.daysLeft", { n: days }) : t("sub.expiredAgo", { n: -days })}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3" title={t("portal.renew")}>
          <p className="mb-4 text-sm text-muted">{t("portal.renewDesc")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {plans.map((p) => (
              <button key={p.id} onClick={() => setPlan(p.id)} className={cn("rounded-xl border p-3 text-start transition", plan === p.id ? "border-accent bg-accent/10" : "border-line hover:border-accent")}>
                <div className="flex items-center justify-between"><b>{tr(`plan.name.${p.name}`, p.name)}</b><b>${p.priceUsd}</b></div>
                <p className="mt-0.5 text-xs text-muted">{p.dataLimitGb ? `${p.dataLimitGb} GB` : t("land.unlimited")} · {p.durationDays >= 365 ? t("land.year") : t("land.days", { n: p.durationDays })}</p>
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Field label={t("buy.currency")} className="min-w-[180px] flex-1">
              <select className="input" value={cur} onChange={(e) => setCur(e.target.value)}>
                {(pub?.payment?.currencies || []).map((c: any) => <option key={c.id} value={c.id}>{c.label} {c.network && `· ${c.network}`}</option>)}
              </select>
            </Field>
            <Btn variant="primary" className="!py-2.5" loading={busy} disabled={!plan || !cur || (pub && !pub.payment?.enabled)} onClick={renew}>{t("portal.payRenew")}</Btn>
          </div>
          {pub && !pub.payment?.enabled && <p className="mt-3 text-xs text-warn">⚠ {t("buy.unavailable")}</p>}
        </Card>
        <Card className="lg:col-span-2" title={t("sub.yourLink")}>
          <div className="flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded-lg bg-card2 px-3 py-2 text-xs" dir="ltr">{me.subUrl}</code><CopyBtn text={me.subUrl} /></div>
          <div className="mt-4 flex justify-center"><Qr text={me.subUrl} size={160} /></div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <a className="btn btn-sm" href={me.pageUrl} target="_blank">{t("portal.openPage")}</a>
            {me.allowTokenReset && <Btn size="sm" onClick={async () => { if (!confirm(t("confirm.regenToken"))) return; const r = await api("/api/portal/me", "POST", { action: "reset-token" }); if (r.ok) { toast(t("common.done")); reload(); } }}>{t("act.regenToken")}</Btn>}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t("sub.connect")}><AppButtons subUrl={me.subUrl} token={token} btn="bg-card2 hover:bg-line border border-line" muted="text-muted" /></Card>
        <Card title={`${t("sub.configs")} (${me.links.length})`}><LinkList links={me.links} btn="bg-card2 hover:bg-line border border-line" muted="text-muted" /></Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title={t("portal.orders")} pad={false}>
          <DataTable rows={me.orders} pageSize={5} columns={[{ key: "kind" }, { key: "amountUsd", type: "money" }, { key: "currency", label: "c.payCurrency", render: (r) => String(r.currency).toUpperCase() }, { key: "status", type: "badge" }, { key: "createdAt", type: "datetime" }]} actions={(r) => r.status === "pending" ? <a className="btn btn-sm" href={`/pay/${r.id}`}>{t("portal.pay")}</a> : null} />
        </Card>
        <Card title={t("portal.security")}>
          <Field label={t("portal.setPassword")} hint={t("portal.setPasswordHint")}><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" dir="ltr" /></Field>
          <Btn className="mt-3" onClick={async () => { const r = await api("/api/portal/me", "POST", { action: "set-password", password: pw }); if (r.ok) { toast(t("common.saved")); setPw(""); } else toast(tr(`err.${r.data.error}`, t("common.error")), "err"); }}>{t("common.save")}</Btn>
        </Card>
      </div>
    </div>
  );
}

export default function PortalPage() {
  const [me, setMe] = useState<any | null | undefined>(undefined);
  const load = useCallback(async () => {
    const r = await fetch("/api/portal/me", { cache: "no-store" });
    setMe(r.ok ? await r.json() : null);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <PublicShell>
      <main className="mx-auto max-w-6xl px-4 py-10">
        {me === undefined ? <div className="flex justify-center p-20 text-muted"><Spinner /></div> : me === null ? <Login onDone={load} /> : <Dashboard me={me} reload={load} onLogout={async () => { await fetch("/api/portal/me", { method: "DELETE" }); setMe(null); }} />}
      </main>
    </PublicShell>
  );
}
