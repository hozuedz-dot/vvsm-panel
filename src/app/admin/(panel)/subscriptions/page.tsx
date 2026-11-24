"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useI18n } from "@/i18n";
import { Card, PageHeader, Tabs, useFetch } from "@/components/ui";
import EntityManager from "@/components/EntityManager";
import SettingsForm from "@/components/SettingsForm";
import { CONFIGS } from "@/lib/entity-configs";

const TEMPLATES = ["aurora", "minimal", "neon", "glass", "terminal", "classic"];

export default function SubscriptionsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState("plans");
  const { data: users } = useFetch<any[]>(tab === "page" ? "/api/admin/users?limit=1" : null);
  const token = users?.[0]?.subToken;
  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.subscriptions")} subtitle={t("subs.subtitle")} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "plans", label: t("nav.plans") },
          { id: "subs", label: t("subs.active") },
          { id: "limits", label: t("subs.limits") },
          { id: "page", label: t("subs.page") },
        ]}
      />
      {tab === "plans" && <EntityManager config={CONFIGS.plans} />}
      {tab === "subs" && <EntityManager config={CONFIGS.subscriptions} />}
      {tab === "limits" && <SettingsForm panel="limits" />}
      {tab === "page" && (
        <div className="space-y-4">
          <Card title={t("subs.templates")}>
            <p className="mb-3 text-sm text-muted">{t("subs.templatesDesc")}</p>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((tp) => (
                <a key={tp} className={`btn ${token ? "" : "pointer-events-none opacity-50"}`} target="_blank" href={token ? `/s/${token}?tpl=${tp}` : "#"}>
                  👁 {tp}
                </a>
              ))}
            </div>
          </Card>
          <SettingsForm panel="subscription" />
          <SettingsForm panel="cleanip" />
        </div>
      )}
    </div>
  );
}
