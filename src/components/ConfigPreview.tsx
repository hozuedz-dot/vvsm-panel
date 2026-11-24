"use client";
import { useState } from "react";
import { useI18n } from "@/i18n";
import { Btn, CodeModal, api, toast } from "@/components/ui";

export default function ConfigButton({ core, label }: { core: string; label?: string }) {
  const { t } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Btn
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          const r = await api<{ text: string }>("/api/admin/actions/preview", "POST", { core });
          setBusy(false);
          if (r.ok) setText(r.data.text || "");
          else toast(t("common.error"), "err");
        }}
      >
        {"{ }"} {label || t("common.viewConfig")}
      </Btn>
      {text !== null && <CodeModal open onClose={() => setText(null)} title={`${core} — ${t("common.generatedConfig")}`} text={text} />}
    </>
  );
}
