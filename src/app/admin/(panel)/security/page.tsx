"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { Badge, Btn, Card, Field, Modal, PageHeader, Tabs, api, toast, useFetch } from "@/components/ui";
import DataTable from "@/components/DataTable";
import SettingsForm from "@/components/SettingsForm";
import { formatBytes } from "@/lib/format";

function Backups() {
  const { t } = useI18n();
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<any>(null);
  const load = useCallback(async () => {
    const r = await api<any>("/api/admin/actions/backup-list", "POST", {});
    setRows(Array.isArray(r.data) ? (r.data as any[]) : []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="space-y-4">
      <SettingsForm panel="backup" />
      <Card
        pad={false}
        title={t("sec.backups")}
        action={<Btn variant="primary" size="sm" loading={busy} onClick={async () => {
          setBusy(true);
          const r = await api<any>("/api/admin/actions/backup-create", "POST", {});
          setBusy(false);
          if (r.data.ok) { toast(t("common.done")); void load(); } else toast(`${t("sec.backupFailed")}: ${String(r.data.error).slice(0, 120)}`, "err");
        }}>＋ {t("sec.createBackup")}</Btn>}
      >
        <DataTable
          rows={rows}
          pageSize={6}
          columns={[{ key: "filename", type: "mono" }, { key: "sizeBytes", type: "bytes" }, { key: "kind" }, { key: "createdAt", type: "datetime" }]}
          actions={(r) => (
            <div className="flex justify-end gap-1">
              <a className="btn btn-sm" href={`/api/admin/actions/download-backup?id=${r.id}`}>⇩</a>
              <Btn size="sm" onClick={() => setConfirm(r)}>↺ {t("sec.restore")}</Btn>
              <Btn size="sm" variant="danger" onClick={async () => { await api("/api/admin/actions/backup-delete", "POST", { id: r.id }); void load(); }}>🗑</Btn>
            </div>
          )}
        />
      </Card>
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={t("sec.restore")} footer={<><Btn onClick={() => setConfirm(null)}>{t("common.cancel")}</Btn><Btn variant="danger" onClick={async () => { const r = await api<any>("/api/admin/actions/backup-restore", "POST", { id: confirm.id }); setConfirm(null); toast(r.data.ok ? t("common.done") : t("common.error"), r.data.ok ? "ok" : "err"); }}>{t("sec.restore")}</Btn></>}>
        <p className="text-sm">{t("sec.restoreWarn")}</p>
      </Modal>
    </div>
  );
}

function Updates() {
  const { t } = useI18n();
  const [items, setItems] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4">
      <SettingsForm panel="updates" />
      <Card title={t("sec.updates")} action={<Btn size="sm" loading={busy} onClick={async () => { setBusy(true); const r = await api<any>("/api/admin/actions/check-updates", "POST", {}); setBusy(false); setItems(r.data.items || []); }}>⟳ {t("sec.checkUpdates")}</Btn>}>
        {items && (
          <ul className="mb-4 divide-y divide-line text-sm">
            {items.map((i) => (
              <li key={i.core} className="flex items-center justify-between py-2.5">
                <b>{i.core}</b>
                <span className="flex items-center gap-2" dir="ltr">
                  <span className="text-muted">{i.installed ? `v${i.installed}` : "—"}</span>
                  {i.latest && <span className="text-muted">→ v{i.latest}</span>}
                  {i.latest ? <Badge tone={i.upToDate ? "green" : "amber"}>{i.upToDate ? t("sec.upToDate") : t("sec.updateAvailable")}</Badge> : <Badge tone="gray">—</Badge>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Btn onClick={async () => { const r = await api<any>("/api/admin/actions/update-cores", "POST", {}); toast(r.data.ok ? t("sec.updateStarted") : t("sec.scriptMissing"), r.data.ok ? "ok" : "info"); }}>⬆ {t("sec.updateCores")}</Btn>
          <Btn onClick={async () => { const r = await api<any>("/api/admin/actions/update-geo", "POST", {}); toast(r.data.ok ? t("sec.updateStarted") : t("sec.scriptMissing"), r.data.ok ? "ok" : "info"); }}>⬆ {t("routing.updateGeo")}</Btn>
        </div>
        <p className="mt-3 text-xs text-muted">{t("sec.updatePanelHint")}</p>
        <code className="mt-1 block rounded-lg bg-card2 px-3 py-2 text-xs" dir="ltr">cd /opt/vvsm &amp;&amp; sudo bash update.sh</code>
      </Card>
    </div>
  );
}

function Reset() {
  const { t } = useI18n();
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card title={t("sec.factoryReset")}>
      <p className="mb-4 text-sm text-bad">⚠ {t("sec.factoryWarn")}</p>
      <div className="max-w-sm space-y-3">
        <Field label={t("sec.typeReset")}><input className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder="RESET" dir="ltr" /></Field>
        <Btn variant="danger" disabled={v !== "RESET"} loading={busy} onClick={async () => {
          setBusy(true);
          const r = await api<any>("/api/admin/actions/factory-reset", "POST", { confirm: v });
          setBusy(false);
          if (r.ok) { toast(t("common.done")); setV(""); setTimeout(() => window.location.reload(), 800); } else toast(t("common.error"), "err");
        }}>{t("sec.factoryReset")}</Btn>
      </div>
    </Card>
  );
}

function SubscriptionDomain() {
  const { t } = useI18n();
  const { data, reload } = useFetch<{ domain: string; origin: string; https: boolean; preview: boolean; acmeEmailConfigured?: boolean; diagnostics?: Record<string, string> | null }>("/api/admin/subdomain", { interval: 30000 });
  const [busy, setBusy] = useState<"test" | "activate" | null>(null);
  const [output, setOutput] = useState("");
  const runDomain = async (action: "test" | "activate") => {
    if (action === "activate" && !window.confirm(t("sec.subConfirm"))) return;
    setBusy(action);
    const response = await api<{ ok?: boolean; output?: string }>("/api/admin/subdomain", "POST", { action });
    setBusy(null);
    setOutput(response.data.output || response.data.error || "");
    toast(response.ok && response.data.ok ? t("common.done") : t("common.error"), response.ok && response.data.ok ? "ok" : "err");
    void reload();
  };
  return (
    <Card title={t("sec.subDomainTitle")}>
      <p className="mb-3 text-sm leading-6 text-muted">{t("sec.subDomainGuide")}</p>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="rounded-lg bg-card2 px-3 py-2 font-mono" dir="ltr">{data?.origin || "—"}</span>
        <Badge tone={data?.https ? "green" : "amber"}>{data?.https ? "HTTPS ✓" : t("sec.subHttp")}</Badge>
      </div>
      {data?.diagnostics && (
        <dl className="mb-3 grid gap-1 rounded-xl bg-card2 p-3 font-mono text-[11px]" dir="ltr">
          {["dns_a", "dns_aaaa", "server_ips", "dns_matches_server", "certificate", "cert_expires", "retry_after", "vhost"].map((key) => (
            <div key={key} className="flex justify-between gap-3"><dt className="text-muted">{key}</dt><dd className="break-all text-end">{data.diagnostics?.[key] || "—"}</dd></div>
          ))}
        </dl>
      )}
      {!data?.acmeEmailConfigured && <p className="mb-2 text-xs font-semibold text-warn">{t("f.acmeEmail")}: —</p>}
      <div className="flex flex-wrap gap-2">
        <Btn size="sm" disabled={data?.preview || !data?.domain || !!busy} loading={busy === "test"} onClick={() => void runDomain("test")}>{t("sec.subTest")}</Btn>
        <Btn size="sm" variant="primary" disabled={data?.preview || !data?.domain || !!busy || data?.https} loading={busy === "activate"} onClick={() => void runDomain("activate")}>{t("sec.subActivate")}</Btn>
      </div>
      {output && <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-card2 p-3 text-xs" dir="ltr">{output}</pre>}
      {data?.preview && <p className="mt-2 text-xs text-muted">{t("core.preview")}</p>}
    </Card>
  );
}

export default function SecurityPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState("tls");
  void formatBytes;
  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.security")} subtitle={t("sec.subtitle")} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "tls", label: t("sec.tlsEch") },
          { id: "access", label: t("sec.access") },
          { id: "obfuscation", label: t("sec.obfuscation") },
          { id: "backup", label: t("sec.backupTab") },
          { id: "maintenance", label: t("sec.maintenance") },
          { id: "updates", label: t("sec.updates") },
          { id: "reset", label: t("sec.factoryReset") },
        ]}
      />
      {tab === "tls" && <SettingsForm panel="tls" />}
      {tab === "access" && <div className="space-y-4"><SettingsForm panel="access" /><SubscriptionDomain /></div>}
      {tab === "obfuscation" && <SettingsForm panel="obfuscation" />}
      {tab === "backup" && <Backups />}
      {tab === "maintenance" && <SettingsForm panel="maintenance" />}
      {tab === "updates" && <Updates />}
      {tab === "reset" && <Reset />}
    </div>
  );
}
