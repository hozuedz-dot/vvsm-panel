"use client";
import { useI18n } from "@/i18n";
import { renderMsg } from "@/lib/msg";

/** Renders server message tokens (lib/msg.ts) in the current panel language. */
export default function Msg({ text, max }: { text: string; max?: number }) {
  const { t } = useI18n();
  const out = renderMsg(t, text || "");
  return <span title={out}>{max && out.length > max ? `${out.slice(0, max)}…` : out}</span>;
}
