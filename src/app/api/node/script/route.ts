import fs from "fs/promises";
import path from "path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { nodes } from "@/db/schema";
import { originOf } from "@/lib/http";
import { dlHelper } from "@/lib/tunnel-install";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("token") || "";
  const [n] = t ? await db.select().from(nodes).where(eq(nodes.agentToken, t)).limit(1) : [];
  if (!n) return new Response("echo 'VVSM: invalid or expired node token'; exit 1\n", { status: 403, headers: { "content-type": "text/x-shellscript" } });
  if (n.isLocal)
    return new Response("#!/usr/bin/env bash\necho '✘ This is the MAIN panel server. It is configured by the Apply button — do not install the node agent here.'\nexit 1\n", { headers: { "content-type": "text/x-shellscript; charset=utf-8" } });
  const panel = originOf(req);
  const agent = (await fs.readFile(path.join(process.cwd(), "scripts", "vvsm-agent.sh"), "utf8")).replace("__PANEL__", panel).replace("__TOKEN__", n.agentToken);
  const script = `#!/usr/bin/env bash
# VVSM node installer — node "${n.name}" (${n.ip || n.domain})
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 1; }
export DEBIAN_FRONTEND=noninteractive
echo "➜ Installing packages…"
apt-get update -y >/dev/null && apt-get install -y curl jq unzip ca-certificates openssl iptables >/dev/null
echo "➜ Checking the panel is reachable from this server…"
curl -fsS -m 15 -o /dev/null "${panel}/api/health" || { echo "✘ Cannot reach ${panel} from this server. Fix DNS/firewall first."; exit 1; }
${dlHelper(panel)}
mkdir -p /usr/local/share/xray /usr/local/etc/xray /etc/vvsm/certs /var/lib/vvsm
echo "➜ Installing / updating Xray-core (official release, SHA-256 verified, via panel mirror)…"
vvsm-core install xray
command -v xray >/dev/null || { echo "✘ Xray could not be installed"; exit 1; }
[ -f /etc/vvsm/certs/fullchain.pem ] || openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=${n.domain || n.ip || "vvsm-node"}" -keyout /etc/vvsm/certs/privkey.pem -out /etc/vvsm/certs/fullchain.pem >/dev/null 2>&1
echo 'net.ipv4.ip_forward=1' > /etc/sysctl.d/99-vvsm.conf; sysctl -p /etc/sysctl.d/99-vvsm.conf >/dev/null || true
rm -f /var/lib/vvsm/agent.hash
cat > /usr/local/bin/vvsm-agent <<'VVSM_AGENT_EOF'
${agent.replace(/\n$/, "")}
VVSM_AGENT_EOF
chmod +x /usr/local/bin/vvsm-agent
cat > /etc/systemd/system/vvsm-agent.service <<'UNIT'
[Unit]
Description=VVSM node agent
After=network-online.target
Wants=network-online.target
[Service]
ExecStart=/usr/local/bin/vvsm-agent
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable xray >/dev/null 2>&1 || true
systemctl enable --now vvsm-agent >/dev/null
systemctl restart vvsm-agent
sleep 8
if systemctl is-active --quiet vvsm-agent; then
  echo "✔ VVSM agent installed on ${n.name}. The node turns ONLINE in the panel within ~30 s."
  echo "  Logs: journalctl -u vvsm-agent -f    |    Xray: systemctl status xray"
else
  echo "✘ Agent failed to start:"; journalctl -u vvsm-agent -n 20 --no-pager
fi
`;
  return new Response(script, { headers: { "content-type": "text/x-shellscript; charset=utf-8", "cache-control": "no-store" } });
}
