"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { Btn, Card, CopyBtn, Modal, PageHeader, Tabs, api, toast } from "@/components/ui";
import SettingsForm from "@/components/SettingsForm";

function CoverTab() {
  const { t } = useI18n();
  const [cfg, setCfg] = useState<{ shopPath?: string; enabled?: boolean } | null>(null);
  const load = () => fetch("/api/admin/settings/cover", { cache: "no-store" }).then((r) => r.json()).then(setCfg).catch(() => null);
  useEffect(() => { void load(); }, []);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = cfg?.shopPath ? `${origin}/${cfg.shopPath}` : "";
  return (
    <div className="space-y-4">
      <Card title={t("cover.linkTitle")}>
        <p className="mb-3 text-sm leading-7 text-muted">{t("cover.linkHelp")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-card2 px-3 py-2 text-xs" dir="ltr">{link || "—"}</code>
          {link && <CopyBtn text={link} />}
          <a className="btn btn-sm" href="/cover" target="_blank" rel="noreferrer">👁 {t("cover.preview")}</a>
        </div>
      </Card>
      <SettingsForm panel="cover" onSaved={(v) => setCfg(v)} />
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState("general");
  const [confirm, setConfirm] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const endpoints = [
    { l: t("set.epIpn"), v: `${origin}/api/pay/nowpayments/ipn` },
    { l: t("set.epSub"), v: `${origin}/sub/<token>` },
    { l: t("set.epPage"), v: `${origin}/s/<token>` },
    { l: t("set.epPortal"), v: `${origin}/portal` },
    { l: t("set.epHealth"), v: `${origin}/api/health` },
  ];
  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.settings")} subtitle={t("set.subtitle")} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "general", label: t("ss.general") }, { id: "cover", label: t("ss.cover") }, { id: "system", label: t("set.system") }]} />
      {tab === "general" && <SettingsForm panel="general" />}
      {tab === "cover" && <CoverTab />}
      {tab === "system" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t("set.endpoints")}>
            <ul className="divide-y divide-line text-sm">
              {endpoints.map((e) => (
                <li key={e.l} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0"><p className="text-xs text-muted">{e.l}</p><code className="block truncate text-xs" dir="ltr">{e.v}</code></div>
                  <CopyBtn text={e.v} />
                </li>
              ))}
            </ul>
          </Card>
          <Card title={t("set.demoData")}>
            <p className="mb-3 text-sm text-muted">{t("set.demoDesc")}</p>
            <Btn variant="danger" onClick={() => setConfirm(true)}>🗑 {t("set.clearDemo")}</Btn>
          </Card>
          <Card title={t("set.configs")}>
            <p className="mb-3 text-sm text-muted">{t("set.configsDesc")}</p>
            <div className="flex flex-wrap gap-2">
              {["xray", "hysteria2", "wireguard", "openvpn", "nginx"].map((c) => <a key={c} className="btn btn-sm" href={`/api/admin/actions/download-config?core=${c}`}>⇩ {c}</a>)}
            </div>
          </Card>
        </div>
      )}
      <Modal open={confirm} onClose={() => setConfirm(false)} title={t("set.clearDemo")} footer={<><Btn onClick={() => setConfirm(false)}>{t("common.cancel")}</Btn><Btn variant="danger" onClick={async () => { await api("/api/admin/actions/clear-demo", "POST", {}); setConfirm(false); toast(t("common.done")); setTimeout(() => window.location.reload(), 600); }}>{t("common.confirm")}</Btn></>}>
        <p className="text-sm">{t("set.clearDemoWarn")}</p>
      </Modal>
    </div>
  );
}
