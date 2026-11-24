"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import PublicShell from "@/components/PublicShell";
import { Btn, Card, toast } from "@/components/ui";

const APPS: { os: string; icon: string; items: [string, string, string][] }[] = [
  { os: "android", icon: "🤖", items: [["Hiddify", "https://github.com/hiddify/hiddify-app/releases/latest", "VLESS · VMess · Trojan · Hysteria2 · WireGuard"], ["v2rayNG", "https://github.com/2dust/v2rayNG/releases/latest", "VLESS · VMess · Trojan"], ["NekoBox", "https://github.com/MatsuriDayo/NekoBoxForAndroid/releases/latest", "All protocols"], ["WireGuard", "https://play.google.com/store/apps/details?id=com.wireguard.android", "WireGuard"], ["OpenVPN Connect", "https://play.google.com/store/apps/details?id=net.openvpn.openvpn", "OpenVPN"]] },
  { os: "ios", icon: "🍎", items: [["Streisand", "https://apps.apple.com/app/streisand/id6450534064", "VLESS · VMess · Trojan · Hysteria2"], ["Shadowrocket", "https://apps.apple.com/app/shadowrocket/id932747118", "All protocols"], ["V2Box", "https://apps.apple.com/app/v2box-v2ray-client/id6446814690", "VLESS · VMess · Trojan"], ["WireGuard", "https://apps.apple.com/app/wireguard/id1441195209", "WireGuard"], ["OpenVPN Connect", "https://apps.apple.com/app/openvpn-connect/id590379981", "OpenVPN"]] },
  { os: "windows", icon: "🪟", items: [["Hiddify", "https://github.com/hiddify/hiddify-app/releases/latest", "All protocols"], ["v2rayN", "https://github.com/2dust/v2rayN/releases/latest", "VLESS · VMess · Trojan · Hysteria2"], ["Clash Verge Rev", "https://github.com/clash-verge-rev/clash-verge-rev/releases/latest", "Clash YAML"], ["WireGuard", "https://www.wireguard.com/install/", "WireGuard"], ["OpenVPN", "https://openvpn.net/client/", "OpenVPN"]] },
  { os: "macos", icon: "💻", items: [["Hiddify", "https://github.com/hiddify/hiddify-app/releases/latest", "All protocols"], ["Streisand", "https://apps.apple.com/app/streisand/id6450534064", "VLESS · VMess · Trojan"], ["Clash Verge Rev", "https://github.com/clash-verge-rev/clash-verge-rev/releases/latest", "Clash YAML"], ["WireGuard", "https://apps.apple.com/app/wireguard/id1451685025", "WireGuard"]] },
  { os: "linux", icon: "🐧", items: [["Hiddify", "https://github.com/hiddify/hiddify-app/releases/latest", "All protocols"], ["NekoRay", "https://github.com/MatsuriDayo/nekoray/releases/latest", "VLESS · VMess · Trojan · Hysteria2"], ["sing-box", "https://sing-box.sagernet.org/clients/", "sing-box JSON"], ["WireGuard", "https://www.wireguard.com/install/", "WireGuard"], ["OpenVPN", "https://openvpn.net/client/", "OpenVPN"]] },
];

export default function AppsPage() {
  const { t } = useI18n();
  const [evt, setEvt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    let active = true;
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e); };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    queueMicrotask(() => { if (active && window.matchMedia("(display-mode: standalone)").matches) setInstalled(true); });
    return () => {
      active = false;
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return (
    <PublicShell>
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-10">
        <div>
          <h1 className="text-3xl font-extrabold">{t("apps.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("apps.sub")}</p>
        </div>

        <Card title={`📲 ${t("apps.pwa")}`}>
          <p className="text-sm leading-relaxed text-muted">{t("apps.pwaDesc")}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Btn variant="primary" disabled={installed} onClick={async () => { if (evt) { evt.prompt(); await evt.userChoice; setEvt(null); } else toast(t("apps.pwaManual"), "info"); }}>
              {installed ? `✓ ${t("apps.installed")}` : t("apps.install")}
            </Btn>
            <a className="btn" href="/portal">{t("land.portal")}</a>
          </div>
          <p className="mt-3 text-xs text-muted">{t("apps.pwaManual")}</p>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {APPS.map((g) => (
            <Card key={g.os} title={<span>{g.icon} {t(`apps.os.${g.os}`)}</span>}>
              <ul className="divide-y divide-line">
                {g.items.map(([name, url, note]) => (
                  <li key={name} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0"><p className="text-sm font-semibold">{name}</p><p className="truncate text-xs text-muted" dir="ltr">{note}</p></div>
                    <a className="btn btn-sm" href={url} target="_blank" rel="noreferrer">⇩ {t("apps.get")}</a>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <Card title={`🧩 ${t("apps.native")}`}>
          <p className="mb-3 text-sm leading-relaxed text-muted">{t("apps.nativeDesc")}</p>
          <div className="grid gap-3 text-xs md:grid-cols-2">
            <div className="rounded-xl bg-card2 p-4"><p className="mb-2 text-sm font-bold">{t("apps.desktop")}</p><code className="block whitespace-pre-wrap" dir="ltr">{"cd apps/desktop\nnpm install\nnpm run dist   # .exe .dmg .AppImage .deb"}</code></div>
            <div className="rounded-xl bg-card2 p-4"><p className="mb-2 text-sm font-bold">{t("apps.mobile")}</p><code className="block whitespace-pre-wrap" dir="ltr">{"cd apps/mobile\nnpm install\nnpx cap add android && npx cap add ios\nnpx cap open android"}</code></div>
          </div>
        </Card>
      </main>
    </PublicShell>
  );
}
