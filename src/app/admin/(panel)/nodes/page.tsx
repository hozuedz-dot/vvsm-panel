"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useI18n } from "@/i18n";
import { Card, PageHeader, Tabs, useFetch } from "@/components/ui";
import EntityManager from "@/components/EntityManager";
import { CONFIGS } from "@/lib/entity-configs";
import { flag } from "@/lib/format";

const ST_COLOR: Record<string, string> = { active: "#10b981", online: "#10b981", degraded: "#f59e0b", pending: "#94a3b8", offline: "#ef4444", error: "#ef4444", disabled: "#64748b", maintenance: "#f59e0b" };

function Topology() {
  const { t } = useI18n();
  const { data: nodes } = useFetch<any[]>("/api/admin/nodes", { interval: 10000 });
  const { data: tunnels } = useFetch<any[]>("/api/admin/tunnels", { interval: 10000 });
  const ns = nodes || [];
  const ts = tunnels || [];
  const local = ns.find((n) => n.isLocal);
  const idOf = (id: number | null) => (id === null || id === undefined ? local?.id : id);
  // column by actual tunnel usage (entry → left, exit → right), falling back to the configured role
  const side = (n: any) => {
    const asEntry = ts.some((x) => idOf(x.entryNodeId) === n.id), asExit = ts.some((x) => idOf(x.exitNodeId) === n.id);
    if (asEntry && !asExit) return 0;
    if (asExit && !asEntry) return 2;
    return n.role === "entry" ? 0 : n.role === "exit" ? 2 : 1;
  };
  const cols: any[][] = [[], [], []];
  ns.forEach((n) => cols[side(n)].push(n));
  const W = 900, BOX_W = 190, BOX_H = 58, GAP = 34;
  const rows = Math.max(1, ...cols.map((c) => c.length));
  const H = Math.max(220, rows * (BOX_H + GAP) + 60);
  const X = [20, W / 2 - BOX_W / 2, W - BOX_W - 20];
  const pos = new Map<number, { x: number; y: number }>();
  cols.forEach((c, ci) => c.forEach((n, i) => pos.set(n.id, { x: X[ci], y: 40 + i * (BOX_H + GAP) + ((rows - c.length) * (BOX_H + GAP)) / 2 })));
  const pairCount = new Map<string, number>();
  return (
    <Card title={t("nodes.topology")}>
      {!ns.length ? <p className="text-sm text-muted">—</p> : (
        <div className="overflow-x-auto rounded-xl bg-card2" dir="ltr">
          <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[700px] w-full">
            <defs>
              {Object.entries(ST_COLOR).map(([k, c]) => (
                <marker key={k} id={`arr-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={c} /></marker>
              ))}
            </defs>
            <text x={X[0] + BOX_W / 2} y="22" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--muted)">{t("c.entry")}</text>
            <text x={X[2] + BOX_W / 2} y="22" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--muted)">{t("c.exit")}</text>
            {ts.map((tn) => {
              const a = pos.get(idOf(tn.entryNodeId)), b = pos.get(idOf(tn.exitNodeId));
              if (!a || !b || a === b) return null;
              const key = `${idOf(tn.entryNodeId)}-${idOf(tn.exitNodeId)}`;
              const k = pairCount.get(key) || 0;
              pairCount.set(key, k + 1);
              const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 14;
              const ltr = a.x <= b.x;
              const x1 = ltr ? a.x + BOX_W : a.x, y1 = a.y + BOX_H / 2 + off, x2 = ltr ? b.x : b.x + BOX_W, y2 = b.y + BOX_H / 2 + off;
              const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
              const st = tn.enabled ? tn.status : "disabled";
              const c = ST_COLOR[st] || "#94a3b8";
              const reverse = tn.mode === "reverse";
              const d = reverse ? `M${x2},${y2} C${mx},${y2} ${mx},${y1} ${x1},${y1}` : `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
              return (
                <g key={tn.id}>
                  <path d={d} fill="none" stroke={c} strokeWidth="2.5" strokeDasharray={reverse ? "7 5" : ""} markerEnd={`url(#arr-${st in ST_COLOR ? st : "pending"})`} opacity={tn.enabled ? 1 : 0.4} />
                  <rect x={mx - 62} y={my - 10} width="124" height="20" rx="10" fill="var(--card)" stroke={c} strokeWidth="1" />
                  <text x={mx} y={my + 4} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="currentColor">{tn.carrier}{reverse ? " ⇄" : " →"} :{tn.listenPort}</text>
                  <title>{`${tn.name} — ${tn.status}`}</title>
                </g>
              );
            })}
            {ns.map((n) => {
              const p = pos.get(n.id)!;
              const c = ST_COLOR[n.status] || "#94a3b8";
              return (
                <g key={n.id}>
                  <rect x={p.x} y={p.y} width={BOX_W} height={BOX_H} rx="12" fill="var(--card)" stroke={c} strokeWidth="2" />
                  <circle cx={p.x + 16} cy={p.y + 18} r="5" fill={c} />
                  <text x={p.x + 28} y={p.y + 22} fontSize="12.5" fontWeight="800" fill="currentColor">{n.isLocal ? "★ " : ""}{flag(n.countryCode)} {String(n.name).slice(0, 18)}</text>
                  <text x={p.x + 14} y={p.y + 42} fontSize="10.5" fill="var(--muted)">{n.ip || n.domain || "—"} · {n.status}</text>
                  <title>{`${n.name} (${n.ip || n.domain}) — ${n.status}`}</title>
                </g>
              );
            })}
          </svg>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        <span><i className="me-1 inline-block h-0.5 w-5 bg-[#10b981] align-middle" />{t("s.active")}</span>
        <span><i className="me-1 inline-block h-0.5 w-5 bg-[#f59e0b] align-middle" />{t("s.degraded")}</span>
        <span><i className="me-1 inline-block h-0.5 w-5 bg-[#ef4444] align-middle" />{t("s.offline")}</span>
        <span><i className="me-1 inline-block h-0.5 w-5 border-t-2 border-dashed border-current align-middle" />{t("o.reverse")}</span>
        <span>→ {t("o.direct")}</span>
      </div>
    </Card>
  );
}

export default function NodesPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState("nodes");
  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.nodes")} subtitle={t("nodes.subtitle")} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "nodes", label: t("nodes.nodes") }, { id: "tunnels", label: t("nav.tunnels") }, { id: "topology", label: t("nodes.topology") }]} />
      {tab === "nodes" && <EntityManager config={CONFIGS.nodes} />}
      {tab === "tunnels" && <EntityManager config={CONFIGS.tunnels} />}
      {tab === "topology" && <Topology />}
    </div>
  );
}
