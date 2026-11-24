"use client";
import { useState } from "react";
import { useI18n } from "@/i18n";
import { PageHeader, Tabs } from "@/components/ui";
import EntityManager from "@/components/EntityManager";
import { CONFIGS } from "@/lib/entity-configs";

export default function UsersPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState("users");
  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.users")} subtitle={t("users.subtitle")} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "users", label: t("nav.users") }, { id: "sessions", label: t("users.sessions") }]} />
      {tab === "users" ? <EntityManager config={CONFIGS.users} /> : <EntityManager config={CONFIGS.sessions} />}
    </div>
  );
}
