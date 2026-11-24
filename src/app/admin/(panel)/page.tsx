"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { Card, PageHeader, Progress, StatusBadge, useFetch } from "@/components/ui";
import { BarChart, Donut, Gauge, LineChart, Sparkline, useTween } from "@/components/charts";
import DataTable from "@/components/DataTable";
import { PROTOCOL_COLORS, PROTOCOLS, cn, flag, formatBytes, formatCompact, formatMoney, formatRate } from "@/lib/format";

const PL: Record<string, string> = { vless: "VLESS", vmess: "VMess", trojan: "Trojan", wireguard: "WireGuard", openvpn: "OpenVPN", hysteria2: "Hysteria2", psiphon: "Psiphon" };
const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#8b5cf6", "#ef4444", "#84cc16"];
const STATUS_COLOR: Record<string, string> = { active: "#10b981", limited: "#f59e0b", expired: "#ef4444", disabled: "#94a3b8" };
const RANGES = ["24h", "7d", "30d", "90d"];

function Kpi({ label, value, prev, spark, color, fmt, sub, noTrend, invert }: { label: string; value: number; prev?: number; spark?: number[]; color: string; fmt: (n: number) => string; sub?: string; noTrend?: boolean; invert?: boolean }) {
  const [v] = useTween([value], 700);
  const delta = prev ? ((value - prev) / prev) * 100 : value > 0 && prev === 0 ? 100 : null;
  const good = delta === null ? true : invert ? delta <= 0 : delta >= 0;
  return (
    <div className="card fade-in relative overflow-hidden p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-muted">{label}</p>
          <p className="mt-1.5 text-2xl font-extrabold tracking-tight tabular-nums sm:text-[1.7rem]"><span dir="ltr" className="inline-block">{fmt(v)}</span></p>
        </div>
        {!noTrend && delta !== null && (
          <span className={cn("badge shrink-0", good ? "bg-ok/15 text-ok" : "bg-bad/15 text-bad")} dir="ltr">
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(delta > 100 ? 0 : 1)}%
          </span>
        )}
      </div>
      {sub && <p className="mt-1 text-[11px] text-muted">{sub}</p>}
      {spark && spark.length > 1 && <div className="mt-3 -mb-1"><Sparkline data={spark} color={color} /></div>}
    </div>
  );
}

export default function Dashboard() {
  const { t, tr } = useI18n();
  const [range, setRange] = useState("7d");
  const [protocol, setProtocol] = useState("all");
  const [kind, setKind] = useState("all");
  const { data, loading } = useFetch<any>(`/api/admin/dashboard?range=${range}&protocol=${protocol}&kind=${kind}`, { interval: 5000 });
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const label = (ts: number) => {
    const d = new Date(ts);
    return data?.unit === "hour" ? `${String(d.getHours()).padStart(2, "0")}:00` : `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const labels: string[] = (data?.labels || []).map(label);
  const k = data?.kpi;
  const ago = data ? Math.max(0, Math.round((now - data.generatedAt) / 1000)) : 0;
  const protoData = (data?.protocols || []).map((p: any) => ({ name: PL[p.name] || p.name, value: p.value, color: PROTOCOL_COLORS[p.name] || "#94a3b8" }));
  const planData = (data?.plans || []).map((p: any, i: number) => ({ name: tr(`plan.name.${p.name}`, p.name), value: p.value, color: PALETTE[i % PALETTE.length] }));
  const statusData = (data?.statuses || []).map((s: any) => ({ name: tr(`s.${s.name}`, s.name), value: s.value, color: STATUS_COLOR[s.name] || "#94a3b8" }));
  const coinMax = Math.max(1, ...(data?.coins || []).map((c: any) => c.value));

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("dash.title")}
        subtitle={<span className="inline-flex items-center gap-2"><span className="live-dot" />{t("dash.updated", { s: ago })}</span>}
        actions={
          <>
            <div className="flex rounded-xl border border-line bg-card p-0.5">
              {RANGES.map((r) => (
                <button key={r} onClick={() => setRange(r)} className={cn("rounded-[10px] px-3 py-1.5 text-xs font-bold transition", range === r ? "bg-accent text-white shadow" : "text-muted hover:text-ink")}>
                  {t(`range.${r}`)}
                </button>
              ))}
            </div>
            <select className="input !w-auto" value={protocol} onChange={(e) => setProtocol(e.target.value)} aria-label={t("c.protocol")}>
              <option value="all">{t("c.protocol")}: {t("common.all")}</option>
              {PROTOCOLS.map((p) => <option key={p} value={p}>{PL[p]}</option>)}
            </select>
            <select className="input !w-auto" value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t("c.kind")}>
              <option value="all">{t("c.kind")}: {t("common.all")}</option>
              <option value="new">{t("o.new")}</option>
              <option value="renew">{t("o.renew")}</option>
            </select>
          </>
        }
      />

      <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4 transition-opacity", loading && !data && "opacity-60")}>
        <Kpi label={t("kpi.revenue")} value={k?.revenue.value || 0} prev={k?.revenue.prev} spark={k?.revenue.spark} color="#10b981" fmt={(n) => formatMoney(Math.round(n))} />
        <Kpi label={t("kpi.orders")} value={k?.orders.value || 0} prev={k?.orders.prev} spark={k?.orders.spark} color="#6366f1" fmt={(n) => String(Math.round(n))} />
        <Kpi label={t("kpi.newUsers")} value={k?.newUsers.value || 0} prev={k?.newUsers.prev} spark={k?.newUsers.spark} color="#ec4899" fmt={(n) => String(Math.round(n))} />
        <Kpi label={t("kpi.traffic")} value={k?.traffic.value || 0} prev={k?.traffic.prev} spark={k?.traffic.spark} color="#06b6d4" fmt={(n) => formatBytes(n)} />
        <Kpi label={t("kpi.online")} value={k?.online.value || 0} spark={k?.online.spark} color="#10b981" fmt={(n) => String(Math.round(n))} noTrend sub={t("kpi.ofTotal", { n: k?.online.total || 0 })} />
        <Kpi label={t("kpi.aov")} value={k?.aov.value || 0} prev={k?.aov.prev} spark={k?.aov.spark} color="#f59e0b" fmt={(n) => formatMoney(Number(n.toFixed(1)))} />
        <Kpi label={t("kpi.renewal")} value={k?.renewal.value || 0} prev={k?.renewal.prev} spark={k?.renewal.spark} color="#8b5cf6" fmt={(n) => `${n.toFixed(0)}%`} />
        <Kpi label={t("kpi.mrr")} value={k?.mrr.value || 0} color="#6366f1" fmt={(n) => formatMoney(Math.round(n))} noTrend sub={t("kpi.mrrSub", { a: k?.mrr.active || 0, e: k?.mrr.expiring || 0, p: k?.mrr.pending || 0 })} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title={t("chart.traffic")} action={<span className="text-xs text-muted">{t("chart.trafficSub")}</span>}>
          <LineChart labels={labels} fmt={(n) => formatBytes(n, 1)} series={[{ name: t("chart.download"), color: "#6366f1", data: data?.traffic.down || [] }, { name: t("chart.upload"), color: "#10b981", data: data?.traffic.up || [] }]} />
        </Card>
        <Card title={t("chart.protocols")}>
          <Donut data={protoData} fmt={(n) => formatBytes(n, 1)} centerLabel={t("chart.total")} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title={t("chart.revenue")}>
          <BarChart labels={labels} fmt={(n) => formatMoney(Math.round(n))} series={[{ name: t("kpi.revenue"), color: "#10b981", data: data?.revenue || [] }]} height={230} />
        </Card>
        <Card title={t("chart.plans")}>
          <Donut data={planData} fmt={(n) => formatMoney(Math.round(n))} centerLabel={t("kpi.revenue")} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("chart.coins")}>
          <ul className="space-y-3">
            {(data?.coins || []).map((c: any, i: number) => (
              <li key={c.name}>
                <div className="mb-1 flex justify-between text-xs"><b>{c.name}</b><span className="text-muted">{formatMoney(Math.round(c.value))} · {c.n}</span></div>
                <Progress value={(c.value / coinMax) * 100} tone={PALETTE[i % PALETTE.length]} />
              </li>
            ))}
            {!data?.coins?.length && <li className="py-6 text-center text-sm text-muted">{t("common.empty")}</li>}
          </ul>
        </Card>
        <Card title={t("chart.userStatus")}>
          <Donut data={statusData} size={160} thickness={20} centerLabel={t("kpi.users")} />
        </Card>
        <Card title={t("chart.server")} action={<a className="text-xs font-semibold text-accent" href="/admin/monitoring">{t("common.details")} →</a>}>
          <div className="grid grid-cols-3 gap-1">
            <Gauge value={data?.system.cpu || 0} label="CPU" color="#6366f1" />
            <Gauge value={data?.system.mem || 0} label="RAM" color="#10b981" />
            <Gauge value={data?.system.disk || 0} label={t("mon.disk")} color="#f59e0b" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-card2 p-3"><p className="text-muted">↓ {t("mon.rx")}</p><p className="mt-0.5 text-sm font-bold"><span dir="ltr" className="inline-block">{formatRate(data?.system.rxBps)}</span></p></div>
            <div className="rounded-xl bg-card2 p-3"><p className="text-muted">↑ {t("mon.tx")}</p><p className="mt-0.5 text-sm font-bold"><span dir="ltr" className="inline-block">{formatRate(data?.system.txBps)}</span></p></div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title={t("dash.nodes")} pad={false}>
          <DataTable
            rows={data?.nodes || []}
            pageSize={6}
            columns={[
              { key: "name", render: (r) => <span className="font-semibold">{flag(r.cc)} {r.name}</span> },
              { key: "status", type: "badge" },
              { key: "cpu", type: "percent", render: (r) => <div className="flex min-w-[90px] items-center gap-2"><Progress value={r.cpu} /><span className="w-8 text-end text-xs">{Math.round(r.cpu)}%</span></div> },
              { key: "ram", type: "percent", render: (r) => <div className="flex min-w-[90px] items-center gap-2"><Progress value={r.ram} /><span className="w-8 text-end text-xs">{Math.round(r.ram)}%</span></div> },
              { key: "users", label: "c.usersCount", type: "number" },
              { key: "rx", label: "c.rxBps", type: "rate" },
              { key: "tx", label: "c.txBps", type: "rate" },
            ]}
          />
        </Card>
        <Card title={t("dash.topUsers")}>
          <ul className="space-y-3.5">
            {(data?.topUsers || []).map((u: any) => (
              <li key={u.username}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-semibold">{u.username}</span>
                  <span className="shrink-0 text-muted" dir="ltr">{formatBytes(u.used)}{u.limit ? ` / ${formatBytes(u.limit)}` : " / ∞"}</span>
                </div>
                <Progress value={u.limit ? (u.used / u.limit) * 100 : 35} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={<span className="inline-flex items-center gap-2">{t("dash.sessions")} <span className="badge bg-ok/15 text-ok">{formatCompact(data?.sessionCount)}</span></span>} pad={false}>
          <DataTable
            rows={data?.sessions || []}
            searchKeys={["username", "ip", "node"]}
            pageSize={6}
            columns={[
              { key: "username", type: "mono" },
              { key: "protocol", type: "protocol" },
              { key: "country", type: "country" },
              { key: "device" },
              { key: "node", label: "c.node" },
              { key: "down", label: "c.downBytes", type: "bytes" },
            ]}
          />
        </Card>
        <Card title={t("dash.recentOrders")} pad={false}>
          <DataTable
            rows={data?.recentOrders || []}
            pageSize={6}
            filters={[{ key: "status", label: "c.status", options: ["paid", "pending", "confirming", "expired", "failed"] }]}
            columns={[
              { key: "username" },
              { key: "plan", label: "c.plan", render: (r) => tr(`plan.name.${r.plan}`, r.plan) },
              { key: "kind" },
              { key: "amount", label: "c.amountUsd", type: "money" },
              { key: "currency", label: "c.payCurrency", render: (r) => String(r.currency).toUpperCase() },
              { key: "status", type: "badge" },
              { key: "createdAt", type: "datetime" },
            ]}
          />
        </Card>
      </div>
      <p className="hidden"><StatusBadge status="active" /></p>
    </div>
  );
}
