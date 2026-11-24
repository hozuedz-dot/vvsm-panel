"use client";
import { useState } from "react";
import { useI18n } from "@/i18n";
import { Btn, Card, CopyBtn, PageHeader, Tabs, api, toast } from "@/components/ui";
import SettingsForm from "@/components/SettingsForm";
import EntityManager from "@/components/EntityManager";
import { CONFIGS } from "@/lib/entity-configs";

type Check = { ok?: boolean; error?: string; warning?: string; targetIsBot?: boolean; configuredChatId?: string; bot?: { id?: number; username?: string; firstName?: string }; chats?: { id: string; name: string; type: string }[] };

export default function NotificationsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState("telegram");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<Check | null>(null);
  const check = async (action: "verify" | "chats" | "test") => {
    setBusy(action);
    const response = await api<Check>("/api/admin/telegram", "POST", { action });
    setBusy("");
    setResult(response.data);
    const bad = !response.ok || !response.data.ok || response.data.targetIsBot;
    toast(bad ? `${t("notif.testFail")}: ${response.data.targetIsBot ? t("notif.botTarget") : response.data.error || t("common.error")}` : t("notif.testOk"), bad ? "err" : "ok");
  };
  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.notifications")} subtitle={t("notif.subtitle")} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "telegram", label: t("ss.telegram") }, { id: "logs", label: t("notif.logs") }]} />
      {tab === "telegram" && (
        <div className="space-y-4">
          <Card title={t("notif.setupTitle")}>
            <ol className="list-inside list-decimal space-y-2 text-sm leading-7 text-muted">
              <li>{t("notif.stepBot")}</li>
              <li>{t("notif.stepSave")}</li>
              <li>{t("notif.stepStart")}</li>
              <li>{t("notif.stepChat")}</li>
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              <Btn size="sm" loading={busy === "verify"} disabled={!!busy} onClick={() => void check("verify")}>{t("notif.verifyBot")}</Btn>
              <Btn size="sm" loading={busy === "chats"} disabled={!!busy} onClick={() => void check("chats")}>{t("notif.findChat")}</Btn>
              <Btn size="sm" variant="primary" loading={busy === "test"} disabled={!!busy} onClick={() => void check("test")}>{t("notif.test")}</Btn>
            </div>
            {result && (
              <div className="mt-3 rounded-xl border border-line bg-card2 p-3 text-xs">
                {result.error && <p className="break-words text-bad">{result.error}</p>}
                {result.targetIsBot && <p className="break-words font-semibold text-bad">{t("notif.botTarget")}</p>}
                {result.bot && <p>✓ @{result.bot.username || result.bot.firstName || result.bot.id} <span className="text-muted">(Bot ID: {result.bot.id})</span></p>}
                {result.chats && (result.chats.length ? result.chats.map((chat) => (
                  <div key={chat.id} className="mt-2 flex flex-wrap items-center gap-2"><span>{chat.name} ({chat.type})</span><code dir="ltr" className="font-semibold">{chat.id}</code><CopyBtn text={chat.id} /><Btn size="sm" variant="primary" disabled={!!busy} onClick={async () => { setBusy("set-chat"); const r = await api<{ ok?: boolean; error?: string }>("/api/admin/telegram", "POST", { action: "set-chat", chatId: chat.id }); setBusy(""); toast(r.ok && r.data.ok ? t("common.saved") : (r.data.error || t("common.error")), r.ok && r.data.ok ? "ok" : "err"); if (r.ok && r.data.ok) setTimeout(() => window.location.reload(), 700); }}>{t("notif.useChat")}</Btn></div>
                )) : <p>{t("notif.noChats")}</p>)}
              </div>
            )}
          </Card>
          <SettingsForm panel="notifications" />
        </div>
      )}
      {tab === "logs" && <EntityManager config={CONFIGS.logs} />}
    </div>
  );
}
