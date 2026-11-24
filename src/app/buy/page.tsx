"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/i18n";
import PublicShell from "@/components/PublicShell";
import { Btn, Field, api, toast, useFetch } from "@/components/ui";
import { cn } from "@/lib/format";

function BuyInner() {
  const { t, tr } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const { data, error, loading, reload } = useFetch<any>("/api/public/plans");
  const [plan, setPlan] = useState<number | null>(null);
  const [cur, setCur] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const plans: any[] = data?.plans || [];
  const pay = data?.payment;

  useEffect(() => {
    if (!plans.length) return;
    const q = Number(sp.get("plan"));
    setPlan((p) => p ?? (plans.find((x) => x.id === q)?.id || plans.find((x) => x.featured)?.id || plans[0].id));
  }, [plans, sp]);
  useEffect(() => {
    if (pay?.currencies?.length && !cur) setCur(pay.currencies[0].id);
  }, [pay, cur]);

  const selected = plans.find((p) => p.id === plan);
  const submit = async () => {
    if (!plan || !cur) return;
    setBusy(true);
    const r = await api<{ id: string }>("/api/public/orders", "POST", { planId: plan, currency: cur, email, username, password, kind: "new" });
    setBusy(false);
    if (!r.ok) return toast(tr(`err.${r.data.error}`, t("common.error")), "err");
    router.push(`/pay/${r.data.id}`);
  };

  return (
    <PublicShell banner={data?.maintenance}>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{t("buy.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("buy.sub")}</p>
        {pay && !pay.enabled && <div className="mt-6 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">⚠ {t("buy.unavailable")}</div>}
        {error && <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm"><span>⚠ {t("common.error")}: {error}</span><Btn size="sm" onClick={() => void reload()}>⟳</Btn></div>}
        {!loading && !error && !plans.length && <div className="mt-6 rounded-xl border border-line bg-card2 p-4 text-sm">{t("buy.noPlans")}</div>}
        <div className="mt-8 grid gap-6 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-3">
            <h2 className="text-sm font-bold text-muted">1. {t("buy.step1")}</h2>
            {plans.map((p) => (
              <button key={p.id} onClick={() => setPlan(p.id)} className={cn("card flex w-full items-center justify-between gap-3 p-4 text-start transition", plan === p.id ? "ring-2 ring-accent" : "hover:border-accent")}>
                <div>
                  <p className="font-bold">{tr(`plan.name.${p.name}`, p.name)} {p.featured && <span className="badge ms-1 bg-accent/15 text-accent">{t("land.popular")}</span>}</p>
                  <p className="mt-0.5 text-xs text-muted">{p.dataLimitGb ? `${p.dataLimitGb} GB` : t("land.unlimited")} · {p.durationDays >= 365 ? t("land.year") : t("land.days", { n: p.durationDays })} · {p.deviceLimit ? t("land.devices", { n: p.deviceLimit }) : t("land.unlimitedDevices")}</p>
                </div>
                <p className="text-2xl font-extrabold">${p.priceUsd}</p>
              </button>
            ))}
          </div>
          <div className="space-y-4 lg:col-span-2">
            <h2 className="text-sm font-bold text-muted">2. {t("buy.step2")}</h2>
            <div className="card space-y-4 p-5">
              <Field label={t("buy.currency")}>
                <div className="grid grid-cols-2 gap-2">
                  {(pay?.currencies || []).map((c: any) => (
                    <button key={c.id} onClick={() => setCur(c.id)} className={cn("rounded-xl border px-3 py-2 text-start text-sm font-semibold transition", cur === c.id ? "border-accent bg-accent/10" : "border-line hover:border-accent")}>
                      {c.label}{c.network && <span className="block text-[11px] font-normal text-muted">{c.network}</span>}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={t("buy.username")} hint={t("buy.usernameHint")}><input className="input" value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" maxLength={24} minLength={3} required autoComplete="username" /></Field>
              <Field label={t("buy.email")} hint={t("buy.emailHint")}><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" required autoComplete="email" /></Field>
              <Field label={t("buy.password")} hint={t("buy.passwordHint")}><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" minLength={10} required autoComplete="new-password" /></Field>
              <div className="flex items-center justify-between border-t border-line pt-4 text-sm"><span className="text-muted">{t("buy.total")}</span><b className="text-xl">${selected?.priceUsd ?? 0}</b></div>
              <Btn variant="primary" className="w-full !py-3" loading={busy} disabled={!plan || !cur || !username.trim() || !email.trim() || password.length < 10 || (pay && !pay.enabled)} onClick={submit}>{t("buy.pay")}</Btn>
              <p className="text-center text-[11px] text-muted">{t("buy.note")}</p>
            </div>
          </div>
        </div>
      </main>
    </PublicShell>
  );
}

export default function BuyPage() {
  return (
    <Suspense>
      <BuyInner />
    </Suspense>
  );
}
