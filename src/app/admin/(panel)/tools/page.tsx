"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { Badge, Btn, Card, Field, PageHeader, Tabs, Toggle, api, toast } from "@/components/ui";
import DataTable from "@/components/DataTable";
import EntityManager from "@/components/EntityManager";
import SettingsForm from "@/components/SettingsForm";
import { CONFIGS } from "@/lib/entity-configs";

function Scanner({ onSaved }: { onSaved: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState<any>({ sources: ["manual"], ranges: "", ports: "443", sni: "speed.cloudflare.com", timeoutMs: 2500, concurrency: 60, sample: 80, maxLatencyMs: 800, maxLossPct: 40, rounds: 2, save: true, keep: 30 });
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any[] | null>(null);
  const [sourcesInfo, setSourcesInfo] = useState<Record<string, number>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [took, setTook] = useState(0);

  useEffect(() => {
    fetch("/api/admin/settings/cleanip").then((r) => r.json()).then((s) => setF((p: any) => ({ ...p, sources: s.sources || ["manual"], ranges: s.ranges, ports: s.ports, sni: s.sni, timeoutMs: s.timeoutMs, concurrency: s.concurrency, sample: s.sample, maxLatencyMs: s.maxLatencyMs ?? 800, maxLossPct: s.maxLossPct ?? 40 })));
  }, []);

  const run = async () => {
    setBusy(true);
    setRes(null);
    const t0 = Date.now();
    const r = await api<any>("/api/admin/tools/scan", "POST", f);
    setBusy(false);
    setTook(Math.round((Date.now() - t0) / 100) / 10);
    if (!r.ok) return toast(t("common.error"), "err");
    setRes(r.data.results);
    setSourcesInfo(r.data.sources || {});
    setWarnings(r.data.warnings || []);
    toast(t("tools.scanDone", { n: r.data.clean, m: r.data.results.length }));
    if (f.save) onSaved();
  };
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const clean = (res || []).filter((x) => x.status === "clean");

  return (
    <div className="space-y-4">
      <Card title={t("tools.scanner")}>
        <p className="mb-4 text-sm text-muted">{t("tools.scannerDesc")}</p>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t("tools.sources")} hint={t("hint.cleanIpSources")} className="md:col-span-3">
            <div className="flex flex-wrap gap-2">{["manual", "cloudflare", "fastly"].map((source) => (
              <button type="button" key={source} onClick={() => set("sources", f.sources.includes(source) ? f.sources.filter((x: string) => x !== source) : [...f.sources, source])} className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${f.sources.includes(source) ? "border-accent bg-accent/10 text-accent" : "border-line"}`}>{source}</button>
            ))}</div>
          </Field>
          <Field label={t("f.ranges")} hint={t("hint.cleanIpRanges")} className="md:col-span-2"><textarea className="input" rows={3} value={f.ranges} onChange={(e) => set("ranges", e.target.value)} dir="ltr" /></Field>
          <div className="space-y-4">
            <Field label={t("f.ports")}><input className="input" value={f.ports} onChange={(e) => set("ports", e.target.value)} dir="ltr" /></Field>
            <Field label={t("f.sni")}><input className="input" value={f.sni} onChange={(e) => set("sni", e.target.value)} dir="ltr" /></Field>
          </div>
          <Field label={t("f.sample")}><input className="input" type="number" value={f.sample} onChange={(e) => set("sample", Number(e.target.value))} /></Field>
          <Field label={t("f.concurrency")}><input className="input" type="number" value={f.concurrency} onChange={(e) => set("concurrency", Number(e.target.value))} /></Field>
          <Field label={t("f.timeoutMs")}><input className="input" type="number" value={f.timeoutMs} onChange={(e) => set("timeoutMs", Number(e.target.value))} /></Field>
          <Field label={t("f.maxLatencyMs")}><input className="input" type="number" min={1} value={f.maxLatencyMs} onChange={(e) => set("maxLatencyMs", Number(e.target.value))} /></Field>
          <Field label={t("f.maxLossPct")}><input className="input" type="number" min={0} max={100} value={f.maxLossPct} onChange={(e) => set("maxLossPct", Number(e.target.value))} /></Field>
          <Field label={t("tools.rounds")}><input className="input" type="number" min={1} max={4} value={f.rounds} onChange={(e) => set("rounds", Number(e.target.value))} /></Field>
          <Field label={t("tools.saveClean")}><div className="pt-1"><Toggle checked={f.save} onChange={(v) => set("save", v)} /></div></Field>
          <div className="flex items-end"><Btn variant="primary" className="w-full" loading={busy} onClick={run}>⚡ {busy ? t("tools.scanning") : t("tools.start")}</Btn></div>
        </div>
      </Card>
      {res && (warnings.length > 0 || Object.keys(sourcesInfo).length > 0) && <div className="card p-3 text-xs text-muted">{Object.entries(sourcesInfo).map(([key, count]) => `${key}: ${count} CIDR`).join(" · ")}{warnings.length > 0 && <p className="mt-1 text-warn">{warnings.join(" · ")}</p>}</div>}
      {res && (
        <Card
          pad={false}
          title={<span className="inline-flex flex-wrap items-center gap-2">{t("tools.results")} <Badge tone="green">{clean.length} {t("s.clean")}</Badge> <Badge tone="gray">{res.length} {t("tools.probed")}</Badge> <Badge tone="blue">{took}s</Badge></span>}
          action={<Btn size="sm" onClick={() => { navigator.clipboard.writeText(clean.map((c) => c.ip).join("\n")); toast(t("common.copied")); }}>⧉ {t("tools.copyClean")}</Btn>}
        >
          <DataTable
            rows={res.map((r, i) => ({ ...r, id: i }))}
            searchKeys={["ip", "colo"]}
            filters={[{ key: "status", label: "c.status", options: ["clean", "blocked"] }]}
            columns={[{ key: "ip", type: "mono" }, { key: "port", type: "number", render: (r) => r.port }, { key: "latencyMs", type: "number" }, { key: "lossPct", type: "percent" }, { key: "provider" }, { key: "colo", label: "c.colo" }, { key: "status", type: "badge" }]}
          />
        </Card>
      )}
    </div>
  );
}

export default function ToolsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState("scanner");
  const [ver, setVer] = useState(0);
  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.tools")} subtitle={t("tools.subtitle")} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "scanner", label: t("tools.scanner") }, { id: "list", label: t("tools.cleanList") }, { id: "settings", label: t("tools.assign") }]} />
      {tab === "scanner" && <Scanner onSaved={() => setVer((v) => v + 1)} />}
      {tab === "list" && (
        <div className="space-y-3" key={ver}>
          <div className="flex justify-end"><Btn size="sm" variant="danger" onClick={async () => { await api("/api/admin/actions/delete-blocked-ips", "POST", {}); setVer((v) => v + 1); toast(t("common.done")); }}>🗑 {t("tools.deleteBlocked")}</Btn></div>
          <EntityManager config={CONFIGS.clean_ips} />
        </div>
      )}
      {tab === "settings" && <SettingsForm panel="cleanip" />}
    </div>
  );
}
