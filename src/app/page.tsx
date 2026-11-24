"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useI18n } from "@/i18n";
import PublicShell from "@/components/PublicShell";
import { useFetch } from "@/components/ui";
import { PROTOCOL_COLORS, PROTOCOLS, cn } from "@/lib/format";

const PL: Record<string, string> = { vless: "VLESS", vmess: "VMess", trojan: "Trojan", wireguard: "WireGuard", openvpn: "OpenVPN", hysteria2: "Hysteria2", psiphon: "Psiphon" };
const FEATURES = [
  ["protocols", "🛰"],
  ["crypto", "₿"],
  ["instant", "⚡"],
  ["stealth", "🕶"],
  ["nodes", "🌍"],
  ["dns", "🧭"],
  ["cleanip", "✨"],
  ["apps", "📱"],
] as const;

export default function Landing() {
  const { t, tr } = useI18n();
  const { data, error, loading } = useFetch<any>("/api/public/plans");
  const plans: any[] = data?.plans || [];
  return (
    <PublicShell banner={data?.maintenance}>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 start-1/4 h-[420px] w-[620px] rounded-full opacity-25 blur-3xl" style={{ background: "radial-gradient(closest-side,var(--accent),transparent)" }} />
          <div className="absolute top-20 end-0 h-[360px] w-[460px] rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(closest-side,#ec4899,transparent)" }} />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 text-center sm:pt-24">
          <span className="badge bg-accent/12 text-accent" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}>● {t("land.badge")}</span>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-6xl">
            {t("land.h1a")} <span className="grad-text">{t("land.h1b")}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted sm:text-lg">{t("land.sub")}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/buy" className="btn btn-primary !px-6 !py-3 !text-base">{t("land.cta")}</Link>
            <Link href="/portal" className="btn !px-6 !py-3 !text-base">{t("land.portal")}</Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {PROTOCOLS.map((p) => (
              <span key={p} className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-bold shadow-sm">
                <i className="h-2 w-2 rounded-full" style={{ background: PROTOCOL_COLORS[p] }} />
                {PL[p]}
              </span>
            ))}
          </div>
          <div className="mx-auto mt-12 grid max-w-3xl grid-cols-3 gap-3">
            {[["7", t("land.stat1")], ["₿ USDT", t("land.stat2")], ["< 2 min", t("land.stat3")]].map(([v, l]) => (
              <div key={l} className="card px-3 py-4"><div className="text-xl font-extrabold sm:text-2xl">{v}</div><div className="mt-0.5 text-xs text-muted">{l}</div></div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-center text-2xl font-extrabold sm:text-3xl">{t("land.featuresTitle")}</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(([k, icon]) => (
            <div key={k} className="card p-5 transition hover:-translate-y-1">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl text-xl" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}>{icon}</div>
              <h3 className="mt-4 font-bold">{t(`land.f.${k}`)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(`land.f.${k}d`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12">
        <h2 className="text-center text-2xl font-extrabold sm:text-3xl">{t("land.pricingTitle")}</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted">{t("land.pricingSub")}</p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => (
            <div key={p.id} className={cn("card relative flex flex-col p-6", p.featured && "ring-2 ring-accent")} style={p.featured ? { boxShadow: "0 20px 50px color-mix(in srgb, var(--accent) 22%, transparent)" } : undefined}>
              {p.featured && <span className="badge absolute -top-3 start-1/2 -translate-x-1/2 bg-accent text-white rtl:translate-x-1/2">{t("land.popular")}</span>}
              <h3 className="text-lg font-extrabold">{tr(`plan.name.${p.name}`, p.name)}</h3>
              <p className="mt-1 min-h-10 text-xs text-muted">{tr(p.description, p.description)}</p>
              <div className="mt-4 flex items-end gap-1"><span className="text-4xl font-extrabold">${p.priceUsd}</span><span className="pb-1 text-sm text-muted">/ {p.durationDays >= 365 ? t("land.year") : t("land.days", { n: p.durationDays })}</span></div>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                <li>✓ {p.dataLimitGb ? `${p.dataLimitGb} GB` : t("land.unlimited")} {t("land.traffic")}</li>
                <li>✓ {p.deviceLimit ? t("land.devices", { n: p.deviceLimit }) : t("land.unlimitedDevices")}</li>
                <li>✓ {p.protocols?.length ? p.protocols.map((x: string) => PL[x]).join(", ") : t("land.allProtocols")}</li>
                <li>✓ {t("land.autoAccount")}</li>
              </ul>
              <Link href={`/buy?plan=${p.id}`} className={cn("btn mt-6 w-full !py-2.5", p.featured && "btn-primary")}>{t("land.buy")}</Link>
            </div>
          ))}
          {!plans.length && <p className="col-span-full text-center text-muted">{loading ? t("common.loading") : error ? `${t("common.error")}: ${error}` : t("buy.noPlans")}</p>}
        </div>
        <p className="mt-6 text-center text-xs text-muted">{t("land.payNote")}</p>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-center text-2xl font-extrabold sm:text-3xl">{t("land.howTitle")}</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="card p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-extrabold text-white">{n}</span>
              <h3 className="mt-4 font-bold">{t(`land.how${n}`)}</h3>
              <p className="mt-1.5 text-sm text-muted">{t(`land.how${n}d`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-12">
        <h2 className="text-center text-2xl font-extrabold sm:text-3xl">{t("land.faqTitle")}</h2>
        <div className="mt-8 space-y-3">
          {[1, 2, 3, 4].map((n) => (
            <details key={n} className="card group p-4">
              <summary className="cursor-pointer list-none font-semibold">{t(`land.q${n}`)}</summary>
              <p className="mt-2 text-sm leading-relaxed text-muted">{t(`land.a${n}`)}</p>
            </details>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
