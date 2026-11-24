"use client";
import { useState } from "react";
import { useI18n } from "@/i18n";
import { Btn, PageHeader, Tabs, api, toast } from "@/components/ui";
import EntityManager from "@/components/EntityManager";
import SettingsForm from "@/components/SettingsForm";
import ConfigButton from "@/components/ConfigPreview";
import { CONFIGS } from "@/lib/entity-configs";

export default function RoutingPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState("presets");
  return (
    <div className="space-y-4">
      <PageHeader
        title={t("nav.routing")}
        subtitle={t("routing.subtitle")}
        actions={
          <>
            <ConfigButton core="xray" label={t("routing.viewRules")} />
            <Btn size="sm" onClick={async () => { const r = await api<{ ok: boolean }>("/api/admin/actions/update-geo", "POST", {}); toast(r.data.ok ? t("routing.geoStarted") : t("routing.geoUnavailable"), r.data.ok ? "ok" : "info"); }}>⟳ {t("routing.updateGeo")}</Btn>
          </>
        }
      />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "presets", label: t("routing.presets") }, { id: "rules", label: t("routing.custom") }, { id: "hidden", label: t("routing.hidden") }]} />
      {tab === "presets" && <SettingsForm panel="routing" />}
      {tab === "rules" && <EntityManager config={CONFIGS.routing_rules} />}
      {tab === "hidden" && (
        <div className="space-y-4">
          <div className="flex justify-end"><ConfigButton core="nginx" label={t("routing.viewNginx")} /></div>
          <SettingsForm panel="hidden" />
        </div>
      )}
    </div>
  );
}
