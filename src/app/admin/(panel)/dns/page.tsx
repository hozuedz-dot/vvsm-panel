"use client";
import { useI18n } from "@/i18n";
import { PageHeader } from "@/components/ui";
import SettingsForm from "@/components/SettingsForm";
import ConfigButton from "@/components/ConfigPreview";

export default function DnsPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.dns")} subtitle={t("dns.subtitle")} actions={<ConfigButton core="xray" />} />
      <SettingsForm panel="dns" />
    </div>
  );
}
