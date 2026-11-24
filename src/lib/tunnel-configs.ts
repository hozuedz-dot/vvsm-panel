import type { nodes, tunnels } from "@/db/schema";
import { tunnelFiles } from "@/lib/tunnel-install";
import { tunnelLocalPort } from "@/lib/cores";

type T = typeof tunnels.$inferSelect;
type N = typeof nodes.$inferSelect;

/** Human-readable view of both sides of a WireGuard / Hysteria2 / OpenVPN / Psiphon tunnel. */
export function nonXrayTunnelConfig(t: T, entry?: N, exit?: N): string {
  const eh = entry?.domain || entry?.ip || "MAIN-SERVER";
  const xh = exit?.domain || exit?.ip || "MAIN-SERVER";
  const out: string[] = [`# Tunnel #${t.id} "${t.name}" — carrier ${t.carrier}, ${t.mode}`, `# entry: ${entry?.name || "main server"} (${eh})  →  exit: ${exit?.name || "main server"} (${xh})`, ""];
  const how: Record<string, string> = {
    wireguard: "AmneziaWG (userspace, DPI-obfuscated WireGuard) interface on both sides; Xray on the entry binds to the tunnel address.",
    hysteria2: `Entry: hysteria client exposes SOCKS 127.0.0.1:${tunnelLocalPort(t)} used by Xray outbound tunnel-${t.id}.`,
    openvpn: "OpenVPN point-to-point TLS (dedicated CA, tls-crypt, AES-256-GCM) + policy routing; Xray binds to the tunnel address.",
    psiphon: `Entry: dedicated psiphon-tunnel-core on SOCKS 127.0.0.1:${tunnelLocalPort(t)}; the Psiphon network is the exit.`,
  };
  out.push(`# ${how[t.carrier] || ""}`, "");
  for (const side of ["entry", "exit"] as const) {
    const f = tunnelFiles({ t, side, entryHost: eh, exitHost: xh, wgMtu: 1280 });
    out.push(`# ================= ${side.toUpperCase()} =================`);
    if (!Object.keys(f.files).length) out.push("# (no extra files on this side)");
    for (const [p, c] of Object.entries(f.files)) out.push(`# ---- ${p}`, c.replace(/PrivateKey = .*/g, "PrivateKey = <hidden>").replace(/-----BEGIN OpenVPN Static key V1-----[\s\S]*-----END OpenVPN Static key V1-----/, "<key hidden>").replace(/-----BEGIN (EC )?PRIVATE KEY-----[\s\S]*?-----END (EC )?PRIVATE KEY-----/g, "<private key hidden>"));
    if (f.exec) out.push(`# service: ${f.exec}`);
    out.push("");
  }
  return out.join("\n");
}
