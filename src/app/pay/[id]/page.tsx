"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useI18n } from "@/i18n";
import PublicShell from "@/components/PublicShell";
import Qr from "@/components/Qr";
import { Btn, CopyBtn, Spinner, StatusBadge, api, toast } from "@/components/ui";

export default function PayPage() {
  const { t, tr } = useI18n();
  const { id } = useParams<{ id: string }>();
  const [o, setO] = useState<any>(null);
  const [err, setErr] = useState(false);
  const [now, setNow] = useState(0);
  const [creds, setCreds] = useState<any>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      try {
        const stored = sessionStorage.getItem(`vvsm_creds_${id}`);
        if (active && stored) setCreds(JSON.parse(stored));
      } catch {}
    });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const r = await fetch(`/api/public/orders/${id}`, { cache: "no-store" });
        if (!r.ok) return setErr(true);
        const j = await r.json();
        if (!alive) return;
        setO(j);
        if (j.credentials) {
          const prev = sessionStorage.getItem(`vvsm_creds_${id}`);
          if (!prev || j.credentials.password) {
            sessionStorage.setItem(`vvsm_creds_${id}`, JSON.stringify(j.credentials));
            setCreds(j.credentials);
          }
        }
        if (["pending", "confirming", "underpaid"].includes(j.status)) timer = setTimeout(load, 5000);
      } catch {
        timer = setTimeout(load, 8000);
      }
    };
    void load();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [id]);

  if (err) return <PublicShell><p className="p-20 text-center text-muted">{t("pay.notFound")}</p></PublicShell>;
  if (!o) return <PublicShell><div className="flex justify-center p-24 text-muted"><Spinner /></div></PublicShell>;

  const left = o.expiresAt ? Math.max(0, Math.floor((new Date(o.expiresAt).getTime() - now) / 1000)) : 0;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const waiting = ["pending", "confirming", "underpaid"].includes(o.status);
  const cur = String(o.payCurrency).toUpperCase().replace(/(TRC20|BSC|ERC20|TON)$/, "");
  const qrText = o.payCurrency === "btc" ? `bitcoin:${o.payAddress}?amount=${o.payAmount}` : o.payAddress;
  const subUrl = creds?.subToken ? (o.subscriptionPageUrl || `${typeof window !== "undefined" ? window.location.origin : ""}/s/${creds.subToken}`) : "";

  return (
    <PublicShell>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-extrabold">{o.kind === "renew" ? t("pay.titleRenew") : t("pay.title")}</h1>
            <p className="text-sm text-muted">{tr(`plan.name.${o.plan?.name}`, o.plan?.name || "")} · ${o.amountUsd} · #{String(o.id).slice(0, 8)}</p>
          </div>
          <StatusBadge status={o.status} />
        </div>

        {waiting && (
          <div className="card fade-in space-y-5 p-5 sm:p-7">
            <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
              <div className="mx-auto"><Qr text={qrText} size={190} /></div>
              <div className="space-y-4">
                <div>
                  <p className="label">{t("pay.amount")}</p>
                  <div className="flex flex-wrap items-center gap-2"><span className="text-2xl font-extrabold tabular-nums" dir="ltr">{o.payAmount} {cur}</span><CopyBtn text={String(o.payAmount)} /></div>
                  <p className="mt-1 text-xs text-muted">{t("pay.network")}: <b>{o.network || "—"}</b> · {t("pay.exact")}</p>
                </div>
                <div>
                  <p className="label">{t("pay.address")}</p>
                  <div className="flex items-center gap-2"><code className="min-w-0 flex-1 break-all rounded-xl bg-card2 p-2.5 text-xs" dir="ltr">{o.payAddress}</code><CopyBtn text={o.payAddress} /></div>
                </div>
                {o.memo && <div><p className="label">Memo / Tag</p><code className="rounded-lg bg-card2 px-2 py-1 text-xs">{o.memo}</code></div>}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card2 px-4 py-3 text-sm">
              <span className="flex items-center gap-2"><Spinner /> {o.status === "confirming" ? t("pay.confirming") : o.status === "underpaid" ? t("pay.underpaid") : t("pay.waiting")}</span>
              <span className="tabular-nums text-muted">{t("pay.expiresIn")} <b className="text-ink" dir="ltr">{mm}:{ss}</b></span>
            </div>
            <p className="text-xs text-muted">⚠ {t("pay.warn")}</p>
            {o.testMode && (
              <div className="rounded-xl border border-warn/40 bg-warn/10 p-4">
                <p className="mb-2 text-sm font-semibold">🧪 {t("pay.testMode")}</p>
                <Btn onClick={async () => { const r = await api<any>(`/api/public/orders/${id}`, "POST", { action: "simulate" }); if (r.ok) setO(r.data); else toast(t("common.error"), "err"); }}>{t("pay.simulate")}</Btn>
              </div>
            )}
          </div>
        )}

        {o.status === "paid" && (
          <div className="card fade-in space-y-5 p-6 text-center sm:p-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ok/15 text-3xl text-ok">✓</div>
            <h2 className="text-xl font-extrabold">{t("pay.success")}</h2>
            <p className="text-sm text-muted">{o.kind === "renew" ? t("pay.successRenew") : t("pay.successNew")}</p>
            {creds && (
              <div className="mx-auto max-w-md space-y-2 text-start text-sm">
                <div className="flex items-center justify-between gap-2 rounded-xl bg-card2 p-3"><span className="text-muted">{t("c.username")}</span><code>{creds.username}</code><CopyBtn text={creds.username} /></div>
                {creds.password && <div className="flex items-center justify-between gap-2 rounded-xl bg-card2 p-3"><span className="text-muted">{t("c.password")}</span><code>{creds.password}</code><CopyBtn text={creds.password} /></div>}
                {creds.password && <p className="text-xs text-warn">⚠ {t("pay.saveCreds")}</p>}
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-3">
              {subUrl && <a href={subUrl} className="btn btn-primary">{t("pay.openSub")}</a>}
              <Link href="/portal" className="btn">{t("land.portal")}</Link>
            </div>
          </div>
        )}

        {(o.status === "expired" || o.status === "failed") && (
          <div className="card fade-in space-y-4 p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-bad/15 text-3xl text-bad">✕</div>
            <h2 className="text-xl font-extrabold">{o.status === "expired" ? t("pay.expired") : t("pay.failed")}</h2>
            <Link href="/buy" className="btn btn-primary">{t("pay.tryAgain")}</Link>
          </div>
        )}
      </main>
    </PublicShell>
  );
}
