"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useI18n } from "@/i18n";
import { Card, PageHeader, Tabs, useFetch } from "@/components/ui";
import EntityManager from "@/components/EntityManager";
import SettingsForm from "@/components/SettingsForm";
import { CONFIGS } from "@/lib/entity-configs";
import { formatMoney } from "@/lib/format";

export default function PaymentsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState("orders");
  const { data: orders } = useFetch<any[]>("/api/admin/orders", { interval: 15000 });
  const paid = (orders || []).filter((o) => o.status === "paid");
  const pending = (orders || []).filter((o) => ["pending", "confirming", "underpaid"].includes(o.status));
  const sum = (a: any[]) => a.reduce((x, o) => x + o.amountUsd, 0);
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const stats = [
    { l: t("fin.total"), v: formatMoney(Math.round(sum(paid))), s: `${paid.length} ${t("fin.orders")}` },
    { l: t("fin.thisMonth"), v: formatMoney(Math.round(sum(paid.filter((o) => String(o.paidAt).startsWith(month))))), s: month },
    { l: t("fin.today"), v: formatMoney(Math.round(sum(paid.filter((o) => String(o.paidAt).startsWith(today))))), s: today },
    { l: t("fin.pending"), v: formatMoney(Math.round(sum(pending))), s: `${pending.length} ${t("fin.orders")}` },
  ];
  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.payments")} subtitle={t("fin.subtitle")} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.l} className="card p-4">
            <p className="text-xs font-semibold text-muted">{s.l}</p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums">{s.v}</p>
            <p className="text-[11px] text-muted">{s.s}</p>
          </div>
        ))}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "orders", label: t("nav.orders") }, { id: "settings", label: t("fin.cryptoSettings") }, { id: "guide", label: t("fin.guide") }]} />
      {tab === "orders" && <EntityManager config={CONFIGS.orders} />}
      {tab === "settings" && <SettingsForm panel="payments" />}
      {tab === "guide" && (
        <Card title={t("fin.guide")}>
          <ol className="list-decimal space-y-2 ps-5 text-sm leading-relaxed">
            <li>{t("fin.g1")}</li>
            <li>{t("fin.g2")}</li>
            <li>{t("fin.g3")}</li>
            <li>{t("fin.g4")}</li>
            <li>{t("fin.g5")}</li>
          </ol>
        </Card>
      )}
    </div>
  );
}
