"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { Badge, Card, PageHeader, Progress, StatusBadge, useFetch } from "@/components/ui";
import { Gauge, LineChart } from "@/components/charts";
import { formatBytes, formatRate } from "@/lib/format";

type Pt = { t: string; cpu: number; mem: number; rx: number; tx: number };
const MAX = 60;

export default function Monitoring() {
  const { t } = useI18n();
  const { data: init } = useFetch<any>("/api/admin/system?history=30&cores=1");
  const [now, setNow] = useState<any>(null);
  const [pts, setPts] = useState<Pt[]>([]);
  const seeded = useRef(false);
  const [cores, setCores] = useState<Record<string, { status: string; version: string }>>({});

  const fmtT = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  useEffect(() => {
    if (init && !seeded.current) {
      seeded.current = true;
      setCores(init.cores || {});
      const hist: Pt[] = (init.history || []).slice(-30).map((h: any) => ({ t: fmtT(h.ts), cpu: h.cpu, mem: h.mem, rx: h.rx, tx: h.tx }));
      setPts(hist);
      setNow(init.now);
    }
  }, [init]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/admin/system", { cache: "no-store" });
        if (r.status === 401) return (window.location.href = "/admin/login");
        const j = await r.json();
        if (!alive) return;
        setNow(j.now);
        setPts((p) => [...p, { t: fmtT(j.now.ts), cpu: j.now.cpu, mem: j.now.mem, rx: j.now.rxBps, tx: j.now.txBps }].slice(-MAX));
      } catch {}
    };
    const id = setInterval(tick, 2500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(async () => {
      const r = await fetch("/api/admin/system?cores=1", { cache: "no-store" });
      if (r.ok) setCores((await r.json()).cores || {});
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const labels = pts.map((p) => p.t);
  const up = (s: number) => `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  const NAMES: Record<string, string> = { xray: "Xray-core (VLESS · VMess · Trojan)", hysteria2: "Hysteria2", wireguard: "WireGuard", openvpn: "OpenVPN", psiphon: "Psiphon tunnel-core", nginx: "Nginx", postgres: "PostgreSQL" };

  return (
    <div className="space-y-5">
      <PageHeader title={t("mon.title")} subtitle={<span className="inline-flex items-center gap-2"><span className="live-dot" />{t("mon.subtitle")}</span>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><Gauge value={now?.cpu || 0} label="CPU" color="#6366f1" sub={t("mon.cores", { n: now?.cores || 0 })} /></Card>
        <Card><Gauge value={now?.mem || 0} label="RAM" color="#10b981" sub={`${formatBytes(now?.memUsed)} / ${formatBytes(now?.memTotal)}`} /></Card>
        <Card><Gauge value={now?.disk || 0} label={t("mon.disk")} color="#f59e0b" sub={`${formatBytes(now?.diskUsed)} / ${formatBytes(now?.diskTotal)}`} /></Card>
        <Card>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">{t("mon.uptime")}</span><b>{now ? up(now.uptime) : "—"}</b></div>
            <div className="flex justify-between"><span className="text-muted">{t("mon.load")}</span><b dir="ltr">{now?.load?.join(" · ") || "—"}</b></div>
            <div className="flex justify-between"><span className="text-muted">{t("mon.host")}</span><b className="truncate ps-3" dir="ltr">{now?.hostname}</b></div>
            <div className="flex justify-between"><span className="text-muted">OS</span><b className="truncate ps-3 text-xs" dir="ltr">{now?.platform}</b></div>
            <div className="flex justify-between"><span className="text-muted">Node.js</span><b dir="ltr">{now?.node}</b></div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={t("mon.cpuRam")}>
          <LineChart labels={labels} fmt={(n) => `${n.toFixed(0)}%`} height={220} series={[{ name: "CPU", color: "#6366f1", data: pts.map((p) => p.cpu) }, { name: "RAM", color: "#10b981", data: pts.map((p) => p.mem) }]} />
        </Card>
        <Card title={t("mon.bandwidth")} action={<span className="text-xs text-muted" dir="ltr">↓ {formatRate(now?.rxBps)} · ↑ {formatRate(now?.txBps)}</span>}>
          <LineChart labels={labels} fmt={(n) => formatRate(n)} height={220} series={[{ name: t("mon.rx"), color: "#06b6d4", data: pts.map((p) => p.rx) }, { name: t("mon.tx"), color: "#ec4899", data: pts.map((p) => p.tx) }]} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("mon.netTotals")}>
          <div className="space-y-4">
            <div><div className="mb-1 flex justify-between text-sm"><span>↓ {t("mon.rxTotal")}</span><b>{formatBytes(now?.rxTotal)}</b></div><Progress value={60} tone="#06b6d4" /></div>
            <div><div className="mb-1 flex justify-between text-sm"><span>↑ {t("mon.txTotal")}</span><b>{formatBytes(now?.txTotal)}</b></div><Progress value={40} tone="#ec4899" /></div>
          </div>
        </Card>
        <Card className="lg:col-span-2" title={t("mon.cores")} action={<span className="text-xs text-muted">{t("mon.coresHint")}</span>}>
          <ul className="divide-y divide-line">
            {Object.entries(NAMES).map(([k, name]) => {
              const c = cores[k];
              const st = c?.status === "active" ? "online" : c?.status === "unavailable" || !c ? "maintenance" : "offline";
              return (
                <li key={k} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="font-semibold">{name}</span>
                  <span className="flex items-center gap-2">
                    {c?.version && <Badge tone="gray">v{c.version}</Badge>}
                    {c?.status === "unavailable" || !c ? <Badge tone="gray">{t("mon.notInstalled")}</Badge> : <StatusBadge status={st} />}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
