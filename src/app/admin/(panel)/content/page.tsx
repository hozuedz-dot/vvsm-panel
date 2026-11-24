"use client";
import { useI18n } from "@/i18n";
import { PageHeader } from "@/components/ui";
import EntityManager from "@/components/EntityManager";
import { CONFIGS } from "@/lib/entity-configs";

export default function ContentPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.content")} subtitle={t("content.subtitle")} actions={<a className="btn btn-sm" href="/blog" target="_blank">↗ {t("content.openBlog")}</a>} />
      <EntityManager config={CONFIGS.posts} />
    </div>
  );
}
