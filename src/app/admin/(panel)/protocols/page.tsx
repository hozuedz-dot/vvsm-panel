"use client";

import { useState } from "react";
import { useI18n } from "@/i18n";
import { Badge, Btn, Card, Modal, PageHeader, StatusBadge, Tabs, useFetch, toast } from "@/components/ui";
import EntityManager from "@/components/EntityManager";
import SettingsForm from "@/components/SettingsForm";
import ConfigButton from "@/components/ConfigPreview";
import { CONFIGS } from "@/lib/entity-configs";

type CoreId = "xray" | "hysteria2" | "wireguard" | "openvpn" | "psiphon" | "nginx";
type Detail = {
  core: CoreId;
  status: string;
  unit: string;
  config: { exists: boolean; size?: number; modifiedAt?: string };
  validation: { ok: boolean; output: string } | null;
  journal: string;
  assets?: { geoip: { exists: boolean; size?: number }; geosite: { exists: boolean; size?: number } };
  peers?: number | null;
};
type CoreData = { cores: Record<string, { status: string; version: string }>; detail: Detail | null; preview: boolean };
const CORES: { id: CoreId; name: string; protos: string; file: string }[] = [
  { id: "xray", name: "Xray-core", protos: "VLESS · VMess · Trojan · XHTTP · REALITY", file: "/usr/local/etc/xray/config.json" },
  { id: "hysteria2", name: "Hysteria 2", protos: "QUIC · Salamander", file: "/etc/hysteria/config.yaml" },
  { id: "wireguard", name: "AmneziaWG (WireGuard)", protos: "Userspace · DPI obfuscation · awg0", file: "/etc/amnezia/amneziawg/awg0.conf" },
  { id: "openvpn", name: "OpenVPN", protos: "UDP / TCP · tls-crypt", file: "/etc/openvpn/server/vvsm.conf" },
  { id: "psiphon", name: "Psiphon tunnel-core", protos: "Upstream SOCKS chain", file: "/etc/vvsm/psiphon.config" },
  { id: "nginx", name: "Nginx", protos: "WS · gRPC · HTTPUpgrade · XHTTP", file: "/etc/vvsm/nginx-routes.conf" },
];

export default function ProtocolsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState("inbounds");
  const [selected, setSelected] = useState<CoreId | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastOutput, setLastOutput] = useState("");
  const { data, reload } = useFetch<CoreData>(tab === "cores" ? "/api/admin/cores" : null, { interval: 20000 });
  const { data: diag, reload: reloadDiag } = useFetch<CoreData>(selected ? `/api/admin/cores?core=${selected}` : null, { interval: 10000 });

  const act = async (core: CoreId, action: string) => {
    if (action === "stop" && !window.confirm(t("core.confirmStop"))) return;
    setBusy(`${core}:${action}`);
    setLastOutput("");
    try {
      const res = await fetch("/api/admin/cores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ core, action }) });
      const result = (await res.json()) as { ok?: boolean; output?: string; error?: string; steps?: { name: string; status: string; detail?: string }[] };
      const steps = result.steps?.map((step) => `${step.name}: ${step.status}${step.detail ? ` — ${step.detail}` : ""}`).join("\n") || "";
      setLastOutput([result.output, steps, result.error].filter(Boolean).join("\n"));
      if (!res.ok || !result.ok) toast(t("core.actionFailed"), "err");
      else toast(t("common.saved"));
      await Promise.all([reload(), reloadDiag()]);
    } catch (error) {
      setLastOutput(String(error));
      toast(t("core.actionFailed"), "err");
    } finally { setBusy(null); }
  };

  const info = diag?.detail;
  const prompts: Record<CoreId, string> = { xray: t("core.xrayHint"), hysteria2: t("core.hysteriaHint"), wireguard: t("core.wgHint"), openvpn: t("core.openvpnHint"), psiphon: t("core.psiphonHint"), nginx: t("core.nginxHint") };
  const prompt = selected ? prompts[selected] : "";

  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.protocols")} subtitle={t("proto.subtitle")} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: "inbounds", label: t("proto.inbounds") },
        { id: "cores", label: t("proto.cores") },
        { id: "wireguard", label: t("proto.wireguard") },
        { id: "psiphon", label: "Psiphon" },
      ]} />

      {tab === "inbounds" && <EntityManager config={CONFIGS.inbounds} />}

      {tab === "cores" && (
        <>
          {data?.preview && <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">{t("core.preview")}</div>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {CORES.map((core) => {
              const state = data?.cores?.[core.id];
              const installed = state && state.status !== "unavailable";
              return (
                <Card key={core.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div><h3 className="font-bold">{core.name}</h3><p className="mt-0.5 text-xs text-muted">{core.protos}</p></div>
                    {state ? installed ? <StatusBadge status={state.status === "active" ? "online" : "offline"} /> : <Badge tone="gray">{t("mon.notInstalled")}</Badge> : null}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted">
                    <span className="truncate font-mono">{core.file}</span>
                    {state?.version && <Badge tone="blue">v{state.version}</Badge>}
                  </div>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted">{prompts[core.id]}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    <Btn size="sm" onClick={() => { setLastOutput(""); setSelected(core.id); }}>{t("core.diagnostics")}</Btn>
                    <ConfigButton core={core.id} />
                    {core.id !== "nginx" && <Btn size="sm" disabled={data?.preview || !!busy} loading={busy === `${core.id}:install`} onClick={() => void act(core.id, installed ? "update" : "install")}>
                      {installed ? t("core.update") : t("core.install")}
                    </Btn>}
                    <Btn size="sm" disabled={data?.preview || !!busy} loading={busy === `${core.id}:apply`} onClick={() => void act(core.id, "apply")}>{t("core.apply")}</Btn>
                    <Btn size="sm" disabled={data?.preview || !!busy} loading={busy === `${core.id}:restart`} onClick={() => void act(core.id, core.id === "nginx" || state?.status === "active" ? "restart" : "start")}>{core.id === "nginx" || state?.status === "active" ? t("core.restart") : t("core.start")}</Btn>
                    {state?.status === "active" && core.id !== "nginx" && <Btn size="sm" variant="danger" disabled={data?.preview || !!busy} onClick={() => void act(core.id, "stop")}>{t("core.stop")}</Btn>}
                    {core.id === "xray" && <Btn size="sm" disabled={data?.preview || !!busy} loading={busy === "xray:update-geo"} onClick={() => void act("xray", "update-geo")}>{t("core.geo")}</Btn>}
                  </div>
                </Card>
              );
            })}
          </div>
          <p className="text-xs text-muted">{t("core.geoHint")}</p>
        </>
      )}

      {tab === "wireguard" && (
        <div className="space-y-4">
          <div className="card border-accent/30 p-4 text-sm leading-7 text-muted">{t("core.wgHint")}</div>
          <SettingsForm panel="wireguard" />
          <div className="flex gap-2"><ConfigButton core="wireguard" /><Btn onClick={() => { setTab("cores"); setSelected("wireguard"); }}>{t("core.diagnostics")}</Btn></div>
        </div>
      )}
      {tab === "psiphon" && (
        <div className="space-y-4">
          <div className="card border-accent/30 p-4 text-sm leading-7 text-muted">{t("core.psiphonHint")}</div>
          <SettingsForm panel="psiphon" />
          <div className="flex gap-2"><ConfigButton core="psiphon" /><Btn onClick={() => { setTab("cores"); setSelected("psiphon"); }}>{t("core.diagnostics")}</Btn></div>
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={`${t("core.diagnostics")} · ${CORES.find((core) => core.id === selected)?.name || ""}`} wide>
        <div className="space-y-4 text-sm">
          {prompt && <p className="rounded-xl bg-card2 p-3 leading-6 text-muted">{prompt}</p>}
          <div className="grid gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-lg border border-line p-2">{t("c.status")}: <b>{info?.status || "—"}</b></div>
            <div className="rounded-lg border border-line p-2">{t("core.files")}: <b>{info?.config.exists ? `${info.config.size || 0} B` : "—"}</b></div>
            {selected === "wireguard" && <div className="rounded-lg border border-line p-2">{t("core.peers")}: <b>{info?.peers ?? "—"}</b></div>}
            {selected === "xray" && <div className="rounded-lg border border-line p-2">GeoIP: <b>{info?.assets?.geoip.exists ? `${info.assets.geoip.size} B` : "—"}</b> · GeoSite: <b>{info?.assets?.geosite.exists ? `${info.assets.geosite.size} B` : "—"}</b></div>}
          </div>
          {info?.validation && <div><h4 className="mb-1 font-semibold">{t("core.validate")}: <span className={info.validation.ok ? "text-ok" : "text-bad"}>{info.validation.ok ? "✓" : "✕"}</span></h4><pre className="max-h-44 overflow-auto rounded-xl bg-card2 p-3 text-xs whitespace-pre-wrap" dir="ltr">{info.validation.output || (info.validation.ok ? "Configuration OK" : "—")}</pre></div>}
          {lastOutput && <div><h4 className="mb-1 font-semibold">{t("core.output")}</h4><pre className="max-h-44 overflow-auto rounded-xl bg-card2 p-3 text-xs whitespace-pre-wrap" dir="ltr">{lastOutput}</pre></div>}
          <div><h4 className="mb-1 font-semibold">{t("core.output")}</h4><pre className="max-h-44 overflow-auto rounded-xl bg-card2 p-3 text-xs whitespace-pre-wrap" dir="ltr">{info?.journal || t("core.noLogs")}</pre></div>
          <div className="flex flex-wrap gap-2"><Btn onClick={() => void reloadDiag()}>{t("core.refresh")}</Btn>{selected === "xray" && <Btn disabled={diag?.preview || !!busy} onClick={() => void act("xray", "update-geo")}>{t("core.geo")}</Btn>}</div>
        </div>
      </Modal>
    </div>
  );
}
