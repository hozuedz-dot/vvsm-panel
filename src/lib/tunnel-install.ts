import crypto from "crypto";
import type { nodes, tunnels } from "@/db/schema";
import { awgLines, tunnelLocalPort, tunnelNet } from "@/lib/cores";
import { awgParams } from "@/lib/keys";

export type TunnelSide = "entry" | "exit";
type T = typeof tunnels.$inferSelect;
type N = typeof nodes.$inferSelect;

const secret = () => process.env.SESSION_SECRET || process.env.DATABASE_URL || "vvsm-dev-secret";
export const tunnelInstallKey = (id: number, side: TunnelSide) => crypto.createHmac("sha256", secret()).update(`tunnel:${id}:${side}`).digest("hex").slice(0, 32);
export function validTunnelInstallKey(id: number, side: TunnelSide, key: string) {
  const a = Buffer.from(tunnelInstallKey(id, side));
  const b = Buffer.from(String(key || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
/** Key for /api/dl (binaries mirrored by the panel for servers that cannot reach GitHub). */
export const downloadKey = () => crypto.createHmac("sha256", secret()).update("dl").digest("hex").slice(0, 20);

const host = (n: N | undefined, fallback: string) => n?.domain || n?.ip || fallback;
const peerKeys = (t: T) => { try { return JSON.parse(t.secret || "{}") as { exitPrivateKey?: string; exitPublicKey?: string }; } catch { return {}; } };
/** exact CN of a PEM certificate (verify-x509-name must match it) */
const peerCN = (pem: string) => { try { return /CN\s*=\s*([^,\n/]+)/.exec(new crypto.X509Certificate(pem).subject)?.[1]?.trim() || "vvsm"; } catch { return "vvsm"; } };
const reverseL3 = (t: T) => t.mode === "reverse" && (t.carrier === "wireguard" || t.carrier === "openvpn");

/** Does this side need files/services installed (false = handled by Xray or nothing to do)? */
export function tunnelSideNeedsInstall(t: T, side: TunnelSide): boolean {
  if (["vless", "vmess", "trojan"].includes(t.carrier)) return false;
  if (t.carrier === "psiphon") return side === "entry";
  if (t.carrier === "wireguard") return true; // AmneziaWG interface on both sides
  return true; // hysteria2, openvpn
}

/** bash helper: download through the panel mirror first, then directly from GitHub. */
export function dlHelper(panel: string) {
  return `export VVSM_MIRROR="${panel}/api/dl" VVSM_DL_KEY="${downloadKey()}"
dl() { curl -fsSL -m 180 -o "$2" "$VVSM_MIRROR/$1?k=$VVSM_DL_KEY" 2>/dev/null && [ -s "$2" ] || curl -fsSL -m 300 -o "$2" "$3"; }
dl vvsm-core.sh /usr/local/sbin/vvsm-core "https://raw.githubusercontent.com/hozuedz-dot/vvsm-vpn/main/scripts/vvsm-core.sh" && chmod +x /usr/local/sbin/vvsm-core || { echo "✘ cannot download vvsm-core"; exit 1; }`;
}

/** Files + systemd unit + extra shell needed on one side of a non-Xray tunnel. */
export function tunnelFiles(o: { t: T; side: TunnelSide; entryHost: string; exitHost: string; wgMtu: number; psiphonConfig?: string }) {
  const { t, side } = o;
  const id = t.id;
  const unit = `vvsm-tun-${id}`;
  const files: Record<string, string> = {};
  let exec = "";
  let pre = "";
  const gwDev = `$(ip -4 route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i=="dev") print $(i+1)}')`;
  if (t.carrier === "wireguard") {
    // AmneziaWG (userspace) on both sides; obfuscation parameters derived from the tunnel secret → identical on both peers
    const k = peerKeys(t);
    const entryIp = tunnelNet(t, 250), exitIp = tunnelNet(t, 249);
    const table = 100 + (id % 150);
    const obf = awgLines({ mode: "amnezia", ...awgParams(`${t.id}:${t.publicKey}`) });
    const rev = reverseL3(t);
    pre = "vvsm-core install awg";
    const conf = `/etc/amnezia/amneziawg/vvsmt${id}.conf`;
    if (side === "exit") {
      files[conf] = `[Interface]\nAddress = ${exitIp}/32\n${rev ? "" : `ListenPort = ${t.listenPort}\n`}PrivateKey = ${k.exitPrivateKey}\nMTU = ${o.wgMtu}\n${obf}PostUp = iptables -t nat -A POSTROUTING -s ${entryIp}/32 -o ${gwDev} -j MASQUERADE; iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT\nPostDown = iptables -t nat -D POSTROUTING -s ${entryIp}/32 -o ${gwDev} -j MASQUERADE; iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT\n\n[Peer]\n# entry server\nPublicKey = ${t.publicKey}\nAllowedIPs = ${entryIp}/32\n${rev ? `Endpoint = ${o.entryHost}:${t.listenPort}\nPersistentKeepalive = ${t.keepAliveSec || 25}\n` : ""}`;
    } else {
      files[conf] = `[Interface]\nAddress = ${entryIp}/32\n${rev ? `ListenPort = ${t.listenPort}\n` : ""}PrivateKey = ${t.privateKey}\nMTU = ${o.wgMtu}\nTable = off\n${obf}PostUp = ip rule add from ${entryIp} table ${table}; ip route replace default dev %i table ${table}\nPostDown = ip rule del from ${entryIp} table ${table}; ip route flush table ${table}\n\n[Peer]\n# exit server\nPublicKey = ${k.exitPublicKey}\nAllowedIPs = 0.0.0.0/0\n${rev ? "" : `Endpoint = ${o.exitHost}:${t.listenPort}\nPersistentKeepalive = ${t.keepAliveSec || 25}\n`}`;
    }
    exec = `awg-quick@vvsmt${id}`;
  } else if (t.carrier === "hysteria2") {
    pre = "command -v hysteria >/dev/null || vvsm-core install hysteria";
    if (side === "exit") {
      files[`/etc/vvsm/tun-${id}.yaml`] = `listen: :${t.listenPort}\ntls:\n  cert: /etc/vvsm/certs/fullchain.pem\n  key: /etc/vvsm/certs/privkey.pem\nauth:\n  type: password\n  password: ${JSON.stringify(t.secret)}\nmasquerade:\n  type: proxy\n  proxy:\n    url: https://www.wikipedia.org\n    rewriteHost: true\n`;
      exec = `/usr/local/bin/hysteria server -c /etc/vvsm/tun-${id}.yaml`;
    } else {
      files[`/etc/vvsm/tun-${id}.yaml`] = `server: ${o.exitHost}:${t.listenPort}\nauth: ${JSON.stringify(t.secret)}\ntls:\n  sni: ${t.sni || o.exitHost}\n  insecure: true\nsocks5:\n  listen: 127.0.0.1:${tunnelLocalPort(t)}\n`;
      exec = `/usr/local/bin/hysteria client -c /etc/vvsm/tun-${id}.yaml`;
    }
  } else if (t.carrier === "openvpn") {
    // point-to-point TLS with a dedicated per-tunnel CA + tls-crypt (static-key mode is removed in OpenVPN 2.7)
    pre = "command -v openvpn >/dev/null || vvsm-core install openvpn\n[ -x /usr/sbin/openvpn ] || ln -sf \"$(command -v openvpn)\" /usr/sbin/openvpn";
    let pki: Record<string, string> = {};
    try { pki = JSON.parse(t.secret || "{}"); } catch { /* invalid */ }
    const dev = `tunv${id}`;
    const entryIp = tunnelNet(t, 251), exitIp = tunnelNet(t, 252);
    const listener = reverseL3(t) ? side === "entry" : side === "exit"; // who opens the port
    const proto = t.transport === "tcp" ? (listener ? "tcp-server" : "tcp-client") : "udp";
    const peer = side === "entry" ? "exit" : "entry";
    files[`/etc/vvsm/tun-${id}/ca.crt`] = pki.ca || "";
    files[`/etc/vvsm/tun-${id}/me.crt`] = pki[`${side}Cert`] || "";
    files[`/etc/vvsm/tun-${id}/me.key`] = pki[`${side}Key`] || "";
    files[`/etc/vvsm/tun-${id}/tc.key`] = pki.tlsCrypt || "";
    const common = `dev ${dev}\ndev-type tun\nproto ${proto}\n${listener ? `port ${t.listenPort}\ntls-server\n` : `remote ${side === "entry" ? o.exitHost : o.entryHost} ${t.listenPort}\nresolv-retry infinite\nnobind\ntls-client\n`}ca /etc/vvsm/tun-${id}/ca.crt\ncert /etc/vvsm/tun-${id}/me.crt\nkey /etc/vvsm/tun-${id}/me.key\ndh none\ntls-crypt /etc/vvsm/tun-${id}/tc.key\nverify-x509-name ${peerCN(pki[`${peer}Cert`] || "")} name\nremote-cert-eku "TLS Web ${listener ? "Client" : "Server"} Authentication"\ndata-ciphers AES-256-GCM:CHACHA20-POLY1305\ntls-version-min 1.2\nkeepalive 10 60\npersist-tun\nverb 3\n`;
    if (side === "exit") {
      files[`/etc/vvsm/tun-${id}.ovpn`] = `${common}ifconfig ${exitIp} ${entryIp}\nscript-security 2\nup "/bin/sh -c 'iptables -t nat -C POSTROUTING -s ${entryIp}/32 -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -s ${entryIp}/32 -j MASQUERADE'"\n`;
    } else {
      const table = 100 + (id % 150);
      files[`/etc/vvsm/tun-${id}-up.sh`] = `#!/bin/sh\nip rule del from ${entryIp} table ${table} 2>/dev/null\nip rule add from ${entryIp} table ${table}\nip route replace default via ${exitIp} dev ${dev} table ${table}\n`;
      files[`/etc/vvsm/tun-${id}.ovpn`] = `${common}ifconfig ${entryIp} ${exitIp}\nscript-security 2\nup /etc/vvsm/tun-${id}-up.sh\n`;
    }
    exec = `/usr/sbin/openvpn --config /etc/vvsm/tun-${id}.ovpn`;
  } else if (t.carrier === "psiphon") {
    if (side === "entry") {
      pre = "test -x /usr/local/bin/psiphon-tunnel-core || vvsm-core install psiphon";
      let cfg: Record<string, unknown> = {};
      try { cfg = JSON.parse(o.psiphonConfig || "{}"); } catch { /* empty */ }
      cfg.LocalSocksProxyPort = tunnelLocalPort(t);
      cfg.LocalHttpProxyPort = tunnelLocalPort(t) + 10000;
      cfg.DataRootDirectory = `/var/lib/vvsm/psiphon-t${id}`;
      files[`/etc/vvsm/tun-${id}.json`] = JSON.stringify(cfg, null, 2);
      exec = `/usr/local/bin/psiphon-tunnel-core -config /etc/vvsm/tun-${id}.json`;
    }
  }
  return { files, exec, pre, unit };
}

export function buildTunnelInstallScript(o: { t: T; side: TunnelSide; entryNode?: N; exitNode?: N; panel: string; key: string; wgMtu: number; psiphonConfig?: string; publicHost?: string }) {
  const panelHost = o.publicHost || new URL(o.panel).hostname;
  const f = tunnelFiles({ t: o.t, side: o.side, entryHost: host(o.entryNode, panelHost), exitHost: host(o.exitNode, panelHost), wgMtu: o.wgMtu, psiphonConfig: o.psiphonConfig });
  const id = o.t.id;
  const writes = Object.entries(f.files).map(([p, c]) => `mkdir -p "$(dirname ${p})"\ncat > ${p} <<'VVSM_EOF'\n${c.replace(/\n$/, "")}\nVVSM_EOF\nchmod 600 ${p}`).join("\n");
  const isService = f.exec.startsWith("/");
  const checkUnit = f.exec.includes("@") || f.exec === "xray" ? f.exec : f.exec ? f.unit : "";
  const target = o.side === "entry" ? o.entryNode : o.exitNode;
  const targetLabel = `${target?.name || "MAIN panel server"} (${host(target, panelHost)})`;
  const listenProto = o.t.carrier === "openvpn" && o.t.transport === "tcp" ? "tcp" : "udp";
  const listensHere = o.t.carrier !== "psiphon" && (reverseL3(o.t) ? o.side === "entry" : o.side === "exit");
  // real end-to-end check from the entry side (plain bash in a quoted heredoc → no escaping needed)
  const test = o.side !== "entry" ? "" : o.t.carrier === "openvpn"
    ? `ms=$(ping -c1 -W3 ${tunnelNet(o.t, 252)} 2>/dev/null | grep -o 'time=[0-9]*' | head -1 | cut -d= -f2); [ -n "$ms" ] && C=true`
    : o.t.carrier === "wireguard"
      ? `hs=$(awg show vvsmt${id} latest-handshakes 2>/dev/null | awk '{print $2}' | head -1); [ -n "$hs" ] && [ $(( $(date +%s) - hs )) -lt 180 ] && C=true && ms=1`
      : ["hysteria2", "psiphon"].includes(o.t.carrier)
        ? `r=$(curl -s -o /dev/null -w '%{http_code} %{time_total}' -m 12 --socks5-hostname 127.0.0.1:${tunnelLocalPort(o.t)} https://www.gstatic.com/generate_204 || true); if [ "\${r%% *}" = "204" ]; then C=true; ms=$(awk -v t="\${r#* }" 'BEGIN{printf "%d", t*1000}'); fi`
        : "";
  const reporter = [
    "#!/usr/bin/env bash",
    `PANEL="${o.panel}"; KEY="${o.key}"`,
    "while true; do",
    `  A=false; C=false; ms=0`,
    checkUnit ? `  systemctl is-active --quiet ${checkUnit} && A=true` : "  A=true",
    test ? `  if [ "$A" = true ]; then ${test}; fi` : `  C=$A`,
    `  body=$(printf '{"tunnelId":${id},"side":"${o.side}","active":%s,"connected":%s,"latencyMs":%s}' "$A" "$C" "\${ms:-0}")`,
    `  curl -fsS -m 10 -X POST -H "x-tunnel-key: $KEY" -H 'content-type: application/json' -d "$body" "$PANEL/api/tunnel/report" >/dev/null 2>&1 || true`,
    "  sleep 60",
    "done",
  ].join("\n");
  const start = isService
    ? `cat > /etc/systemd/system/${f.unit}.service <<'UNIT'
[Unit]
Description=VVSM tunnel #${id} (${o.side})
After=network-online.target
[Service]
ExecStart=${f.exec}
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable ${f.unit} >/dev/null 2>&1
systemctl restart ${f.unit}`
    : f.exec.includes("@") ? `systemctl enable ${f.exec} >/dev/null 2>&1; systemctl restart ${f.exec}`
    : `echo "Nothing to install on this side for ${o.t.carrier}; the panel's Xray config handles it."`;
  return `#!/usr/bin/env bash
# ============================================================================
#  VVSM tunnel #${id} "${o.t.name}" — ${o.t.carrier.toUpperCase()} (${o.t.mode})
#  ▶ RUN THIS ON THE ${o.side.toUpperCase()} SERVER:  ${targetLabel}
# ============================================================================
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 1; }
export DEBIAN_FRONTEND=noninteractive
echo "➜ Installing tunnel #${id} (${o.side} side) on ${targetLabel}"
apt-get update -y >/dev/null 2>&1 || true
apt-get install -y curl openssl iptables unzip ca-certificates >/dev/null
echo 'net.ipv4.ip_forward=1' > /etc/sysctl.d/99-vvsm-tunnel.conf && sysctl -p /etc/sysctl.d/99-vvsm-tunnel.conf >/dev/null
mkdir -p /etc/vvsm/certs /var/lib/vvsm
[ -f /etc/vvsm/certs/fullchain.pem ] || openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=vvsm-tunnel" -keyout /etc/vvsm/certs/privkey.pem -out /etc/vvsm/certs/fullchain.pem >/dev/null 2>&1
${dlHelper(o.panel)}
${f.pre}
${writes}
${f.files[`/etc/vvsm/tun-${id}-up.sh`] ? `chmod 755 /etc/vvsm/tun-${id}-up.sh` : ""}
${listensHere ? `if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow ${o.t.listenPort}/${listenProto} >/dev/null; fi
iptables -C INPUT -p ${listenProto} --dport ${o.t.listenPort} -j ACCEPT 2>/dev/null || iptables -I INPUT -p ${listenProto} --dport ${o.t.listenPort} -j ACCEPT || true` : ""}
${start}
cat > /usr/local/bin/vvsm-tun-${id}-report <<'VVSM_REPORT_EOF'
${reporter}
VVSM_REPORT_EOF
chmod +x /usr/local/bin/vvsm-tun-${id}-report
cat > /etc/systemd/system/vvsm-tun-${id}-report.service <<'UNIT'
[Unit]
Description=VVSM tunnel #${id} health reporter
After=network-online.target
[Service]
ExecStart=/usr/local/bin/vvsm-tun-${id}-report
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload && systemctl enable vvsm-tun-${id}-report >/dev/null 2>&1 && systemctl restart vvsm-tun-${id}-report
sleep 3
${checkUnit && checkUnit !== "xray" ? `systemctl is-active --quiet ${checkUnit} || { echo "✘ ${checkUnit} failed to start:"; journalctl -u ${checkUnit} -n 15 --no-pager; exit 1; }` : ""}
echo "✔ Tunnel #${id}: ${o.side.toUpperCase()} side installed on ${targetLabel}."
${listensHere ? `echo "  Make sure ${o.t.listenPort}/${listenProto} is open in this server's provider firewall."` : ""}
`;
}
