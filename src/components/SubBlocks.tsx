"use client";
import { useState } from "react";
import { useI18n } from "@/i18n";
import Qr from "@/components/Qr";
import { PROTOCOL_COLORS, cn } from "@/lib/format";
import { toast, useCopy } from "@/components/ui";

const b64 = (s: string) => (typeof window !== "undefined" ? window.btoa(s) : "");

export function appLinks(subUrl: string, name = "VVSM") {
  const e = encodeURIComponent(subUrl);
  return [
    { id: "hiddify", name: "Hiddify", url: `hiddify://import/${subUrl}#${encodeURIComponent(name)}`, os: "Android · iOS · Win · macOS · Linux" },
    { id: "v2rayng", name: "v2rayNG", url: `v2rayng://install-config?url=${e}`, os: "Android" },
    { id: "streisand", name: "Streisand", url: `streisand://import/${subUrl}`, os: "iOS · macOS" },
    { id: "singbox", name: "sing-box", url: `sing-box://import-remote-profile?url=${e}#${encodeURIComponent(name)}`, os: "Android · iOS · macOS" },
    { id: "clash", name: "Clash Meta / Verge", url: `clash://install-config?url=${encodeURIComponent(subUrl + "/clash")}`, os: "Win · macOS · Linux · Android" },
    { id: "shadowrocket", name: "Shadowrocket", url: `sub://${b64(subUrl)}`, os: "iOS" },
    { id: "v2box", name: "V2Box", url: `v2box://install-sub?url=${e}&name=${encodeURIComponent(name)}`, os: "iOS · macOS" },
  ];
}

export function UsageBar({ used, limit, color, track }: { used: number; limit: number; color: string; track?: string }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className={cn("h-2.5 w-full overflow-hidden rounded-full", track || "bg-black/10")}>
      <div className="bar-anim h-full rounded-full" style={{ width: `${limit ? pct : 100}%`, background: limit ? (pct > 90 ? "#ef4444" : color) : color, opacity: limit ? 1 : 0.35 }} />
    </div>
  );
}

export function LinkList({ links, btn, muted }: { links: { name: string; protocol: string; uri: string }[]; btn: string; muted: string }) {
  const { t } = useI18n();
  const copy = useCopy();
  const [qr, setQr] = useState<number | null>(null);
  if (!links.length) return <p className={cn("py-4 text-center text-sm", muted)}>{t("sub.noLinks")}</p>;
  return (
    <ul className="space-y-2">
      {links.map((l, i) => (
        <li key={i} className="rounded-xl border border-current/10 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PROTOCOL_COLORS[l.protocol] || "#94a3b8" }} />
              <span className="truncate">{l.name}</span>
              <span className={cn("hidden text-[10px] font-normal uppercase sm:inline", muted)}>{l.protocol}</span>
            </span>
            <span className="flex shrink-0 gap-1.5">
              <button className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold", btn)} onClick={() => setQr(qr === i ? null : i)}>QR</button>
              <button className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold", btn)} onClick={() => (l.protocol === "openvpn" ? window.open(l.uri, "_blank") : copy(l.uri))}>{l.protocol === "openvpn" ? "⇩ .ovpn" : t("common.copy")}</button>
            </span>
          </div>
          {qr === i && <div className="mt-3 flex justify-center"><Qr text={l.uri} size={170} /></div>}
        </li>
      ))}
    </ul>
  );
}

export function AppButtons({ subUrl, token, btn, muted, name }: { subUrl: string; token: string; btn: string; muted: string; name?: string }) {
  const { t } = useI18n();
  const apps = appLinks(subUrl, name);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {apps.map((a) => (
          <a key={a.id} href={a.url} onClick={() => toast(t("sub.opening", { app: a.name }), "info")} className={cn("rounded-xl px-3 py-2.5 text-center text-sm font-semibold transition", btn)}>
            {a.name}
            <span className={cn("block text-[10px] font-normal", muted)}>{a.os}</span>
          </a>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {[["clash", "Clash YAML"], ["singbox", "sing-box JSON"], ["xray", "Xray JSON"], ["wg", "WireGuard .conf"], ["ovpn", "OpenVPN .ovpn"]].map(([k, l]) => (
          <a key={k} className={cn("rounded-lg px-3 py-1.5 font-semibold", btn)} href={`/sub/${token}/${k}`} target="_blank">⇩ {l}</a>
        ))}
      </div>
      <p className={cn("text-xs", muted)}>
        {t("sub.noApp")} <a className="underline" href="/apps">{t("sub.getApps")}</a>
      </p>
    </div>
  );
}
