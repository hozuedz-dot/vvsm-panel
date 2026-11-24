"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { LangSwitch, useI18n } from "@/i18n";
import Qr from "@/components/Qr";
import { AppButtons, LinkList, UsageBar } from "@/components/SubBlocks";
import { CopyBtn, Spinner, StatusBadge, useFetch } from "@/components/ui";
import { cn, daysLeft, formatBytes, formatDate } from "@/lib/format";

type Tpl = { page: string; card: string; muted: string; btn: string; accent: string; track: string; layout: "center" | "two" | "list"; blobs?: boolean; qr: [string, string]; head: string };
const TPLS: Record<string, Tpl> = {
  aurora: { page: "bg-[#0a0f1f] text-white", card: "bg-white/[0.06] border border-white/10 backdrop-blur-xl rounded-3xl p-5", muted: "text-white/55", btn: "bg-white/10 hover:bg-white/20 border border-white/10", accent: "#8b5cf6", track: "bg-white/10", layout: "center", blobs: true, qr: ["#0a0f1f", "#ffffff"], head: "font-extrabold" },
  minimal: { page: "bg-white text-slate-900", card: "border-b border-slate-200 pb-6", muted: "text-slate-500", btn: "bg-slate-100 hover:bg-slate-200", accent: "#0f172a", track: "bg-slate-200", layout: "list", qr: ["#0f172a", "#ffffff"], head: "font-bold" },
  neon: { page: "bg-black text-cyan-50", card: "bg-zinc-950 border border-cyan-400/40 rounded-xl p-5 shadow-[0_0_30px_rgba(34,211,238,.18)]", muted: "text-cyan-100/50", btn: "bg-cyan-400/10 hover:bg-cyan-400/20 border border-cyan-400/30 text-cyan-100", accent: "#22d3ee", track: "bg-cyan-400/10", layout: "center", qr: ["#000000", "#67e8f9"], head: "font-extrabold uppercase tracking-widest" },
  glass: { page: "bg-gradient-to-br from-indigo-100 via-white to-pink-100 text-slate-900", card: "bg-white/60 backdrop-blur-xl border border-white rounded-3xl p-5 shadow-xl shadow-indigo-200/40", muted: "text-slate-500", btn: "bg-white/80 hover:bg-white border border-white shadow-sm", accent: "#6366f1", track: "bg-slate-900/10", layout: "two", qr: ["#312e81", "#ffffff"], head: "font-extrabold" },
  terminal: { page: "bg-black text-green-400 font-mono", card: "border border-green-500/50 p-4", muted: "text-green-600", btn: "border border-green-500/50 hover:bg-green-500/10", accent: "#22c55e", track: "bg-green-500/15", layout: "list", qr: ["#000000", "#4ade80"], head: "font-bold uppercase" },
  classic: { page: "bg-slate-100 text-slate-900", card: "bg-white border border-slate-200 rounded-lg p-5 shadow-sm", muted: "text-slate-500", btn: "bg-slate-100 hover:bg-slate-200 border border-slate-200", accent: "#2563eb", track: "bg-slate-200", layout: "two", qr: ["#0f172a", "#ffffff"], head: "font-bold" },
};

function SubInner() {
  const { t } = useI18n();
  const { token } = useParams<{ token: string }>();
  const sp = useSearchParams();
  const { data, error, loading } = useFetch<any>(`/api/public/sub/${token}`, { interval: 30000 });
  const [pick, setPick] = useState<string>("");
  useEffect(() => {
    const q = sp.get("tpl") || localStorage.getItem("vvsm_tpl") || "";
    if (q && TPLS[q]) setPick(q);
  }, [sp]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#0a0f1f] text-white/60"><Spinner /></div>;
  if (error || !data) return <div className="flex min-h-screen items-center justify-center bg-[#0a0f1f] p-6 text-center text-white/70">{t("sub.notFound")}</div>;

  const key = (data.settings.allowUserTemplate || sp.get("tpl")) && pick ? pick : data.settings.template;
  const T = TPLS[key] || TPLS.aurora;
  const days = daysLeft(data.expiresAt);
  const active = data.status === "active";
  const pct = data.limit ? Math.min(100, (data.used / data.limit) * 100) : 0;

  const header = (
    <div className="text-center">
      <p className={cn("text-xs uppercase tracking-[0.25em]", T.muted)}>{data.settings.title}</p>
      <h1 className={cn("mt-1 text-3xl", T.head)}>{data.username}</h1>
      <div className="mt-2 flex items-center justify-center gap-2 text-sm"><StatusBadge status={data.status} />{data.plan && <span className={T.muted}>· {data.plan}</span>}</div>
    </div>
  );
  const usage = (
    <div className={T.card}>
      <div className="grid grid-cols-2 gap-4">
        <div><p className={cn("text-xs", T.muted)}>{t("sub.expires")}</p><p className="mt-0.5 text-lg font-bold">{data.expiresAt ? formatDate(data.expiresAt) : "∞"}</p><p className={cn("text-xs", days !== null && days < 4 ? "text-red-400" : T.muted)}>{days === null ? "" : days >= 0 ? t("sub.daysLeft", { n: days }) : t("sub.expiredAgo", { n: -days })}</p></div>
        <div className="text-end"><p className={cn("text-xs", T.muted)}>{t("sub.traffic")}</p><p className="mt-0.5 text-lg font-bold" dir="ltr">{formatBytes(data.used)} <span className={cn("text-xs font-normal", T.muted)}>/ {data.limit ? formatBytes(data.limit) : "∞"}</span></p><p className={cn("text-xs", T.muted)}>{data.limit ? `${pct.toFixed(0)}%` : t("land.unlimited")}</p></div>
      </div>
      {data.settings.showUsage && <div className="mt-4"><UsageBar used={data.used} limit={data.limit} color={T.accent} track={T.track} /></div>}
      {!active && (
        <div className="mt-4 rounded-xl bg-red-500/15 p-3 text-center text-sm text-red-400">
          {t("sub.inactive")} <a href="/portal" className="font-bold underline">{t("sub.renew")}</a>
        </div>
      )}
    </div>
  );
  const subscribe = (
    <div className={T.card}>
      <h2 className={cn("mb-3 text-sm", T.head)}>{t("sub.yourLink")}</h2>
      <div className="flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded-lg bg-black/10 px-3 py-2 text-xs" dir="ltr">{data.subUrl}</code><CopyBtn text={data.subUrl} /></div>
      {data.settings.showQr && <div className="mt-4 flex justify-center"><Qr text={data.subUrl} size={170} dark={T.qr[0]} light={T.qr[1]} /></div>}
    </div>
  );
  const apps = data.settings.showApps && (
    <div className={T.card}>
      <h2 className={cn("mb-3 text-sm", T.head)}>{t("sub.connect")}</h2>
      <AppButtons subUrl={data.subUrl} token={token} btn={T.btn} muted={T.muted} name={data.settings.title} />
    </div>
  );
  const configs = (
    <div className={T.card}>
      <h2 className={cn("mb-3 text-sm", T.head)}>{t("sub.configs")} <span className={cn("text-xs font-normal", T.muted)}>({data.links.length})</span></h2>
      <LinkList links={data.links} btn={T.btn} muted={T.muted} />
      {data.openVpnCredentials && (
        <div className="mt-4 space-y-2 rounded-xl bg-black/10 p-3 text-xs">
          <p className="font-bold">OpenVPN</p>
          <div className="flex items-center gap-2"><span className={T.muted}>{t("c.username")}</span><code dir="ltr">{data.openVpnCredentials.username}</code><CopyBtn text={data.openVpnCredentials.username} /></div>
          <div className="flex items-center gap-2"><span className={T.muted}>{t("c.password")}</span><code dir="ltr">{data.openVpnCredentials.password}</code><CopyBtn text={data.openVpnCredentials.password} /></div>
        </div>
      )}
    </div>
  );
  const announce = data.settings.announce && <div className={cn(T.card, "text-center text-sm")}>📢 {data.settings.announce}</div>;

  let body: ReactNode;
  if (T.layout === "two")
    body = (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">{usage}{subscribe}{announce}</div>
        <div className="space-y-4">{apps}{configs}</div>
      </div>
    );
  else
    body = <div className={cn("space-y-4", T.layout === "list" && "space-y-6")}>{usage}{announce}{subscribe}{apps}{configs}</div>;

  return (
    <div className={cn("relative min-h-screen overflow-hidden", T.page)} style={{ transition: "background .3s" }}>
      {T.blobs && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 start-1/3 h-96 w-96 rounded-full bg-violet-600/30 blur-3xl" />
          <div className="absolute bottom-0 end-0 h-96 w-96 rounded-full bg-pink-500/20 blur-3xl" />
          <div className="absolute top-1/3 -start-24 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
        </div>
      )}
      <div className={cn("relative mx-auto px-4 py-8", T.layout === "two" ? "max-w-5xl" : "max-w-xl")}>
        <div className="mb-5 flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {(data.settings.allowUserTemplate || sp.get("tpl")) &&
              Object.keys(TPLS).map((k) => (
                <button key={k} onClick={() => { setPick(k); localStorage.setItem("vvsm_tpl", k); }} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition", key === k ? "text-white" : T.btn)} style={key === k ? { background: T.accent } : undefined}>{k}</button>
              ))}
          </div>
          <div className="text-slate-900"><LangSwitch compact /></div>
        </div>
        <div className="mb-6">{header}</div>
        {body}
        <p className={cn("mt-8 text-center text-xs", T.muted)}>
          {data.settings.footer} · <a className="underline" href={data.settings.supportLink} target="_blank">{t("sub.support")}</a>
        </p>
      </div>
    </div>
  );
}

export default function SubPage() {
  return (
    <Suspense>
      <SubInner />
    </Suspense>
  );
}
