/* eslint-disable @typescript-eslint/no-explicit-any */
// Single source of truth for protocol / transport / security compatibility.
// Used by the admin forms (client) AND the API (server) so that what the UI
// offers is exactly what the config generator can build.

export const XRAY_PROTOCOLS = ["vless", "vmess", "trojan", "psiphon"];
export const XRAY_TRANSPORTS = ["tcp", "ws", "grpc", "httpupgrade", "xhttp"];
export const HTTP_TRANSPORTS = ["ws", "grpc", "httpupgrade", "xhttp"]; // can sit behind Nginx / CDN
export const REALITY_TRANSPORTS = ["tcp", "grpc", "xhttp"];
export const TUNNEL_CARRIERS = ["vless", "vmess", "trojan", "wireguard", "hysteria2", "openvpn", "psiphon"];
export const XRAY_CARRIERS = ["vless", "vmess", "trojan"];
/** Carriers that support reverse mode (the exit dials the entry). VMess/Trojan reverse is built on VLESS Reverse Proxy. */
export const REVERSE_CARRIERS = ["vless", "vmess", "trojan", "wireguard", "openvpn"];

export const isXrayProtocol = (p: string) => XRAY_PROTOCOLS.includes(p);
export const isXrayCarrier = (c: string) => XRAY_CARRIERS.includes(c);

export function transportsFor(protocol: string): string[] {
  if (protocol === "hysteria2" || protocol === "wireguard") return ["udp"];
  if (protocol === "openvpn") return ["udp", "tcp"];
  return XRAY_TRANSPORTS;
}

export function securitiesFor(protocol: string, transport: string, hidden = false): string[] {
  if (protocol === "wireguard") return ["none"];
  if (protocol === "hysteria2" || protocol === "openvpn") return ["tls"];
  if (hidden) return ["tls"]; // Nginx terminates TLS for hidden routes
  // Xray 26 refuses VLESS/Trojan without TLS/REALITY to public addresses → only VMess may run without TLS
  const out = protocol === "vmess" ? ["none", "tls"] : ["tls"];
  if (protocol !== "vmess" && REALITY_TRANSPORTS.includes(transport)) out.push("reality");
  return out;
}

export function flowsFor(protocol: string, transport: string, security: string): string[] {
  if ((protocol === "vless" || protocol === "psiphon") && transport === "tcp" && (security === "tls" || security === "reality")) return ["", "xtls-rprx-vision"];
  return [""];
}

export function tunnelTransportsFor(carrier: string): string[] {
  if (["wireguard", "hysteria2"].includes(carrier)) return ["udp"];
  if (carrier === "openvpn") return ["udp", "tcp"];
  if (carrier === "psiphon") return ["tcp"];
  return XRAY_TRANSPORTS;
}

export function tunnelSecuritiesFor(carrier: string, transport: string): string[] {
  if (carrier === "wireguard" || carrier === "psiphon") return ["none"];
  if (carrier === "hysteria2" || carrier === "openvpn") return ["tls"];
  const out = carrier === "vmess" ? ["none", "tls"] : ["tls"];
  if (carrier !== "vmess" && REALITY_TRANSPORTS.includes(transport)) out.push("reality");
  return out;
}

/** Normalise an inbound so the combination is always buildable. Returns warnings. */
export function normalizeInbound(d: Record<string, any>): string[] {
  const warn: string[] = [];
  const p = String(d.protocol || "vless");
  const tr = transportsFor(p);
  if (!tr.includes(d.transport)) {
    if (d.transport) warn.push(`transport ${d.transport} → ${tr[0]}`);
    d.transport = tr[0];
  }
  if (!isXrayProtocol(p) || !HTTP_TRANSPORTS.includes(d.transport)) d.hidden = false;
  const sec = securitiesFor(p, d.transport, !!d.hidden);
  if (!sec.includes(d.security)) {
    const next = sec.includes("tls") ? "tls" : sec[0];
    if (d.security) warn.push(`security ${d.security} → ${next}`);
    d.security = next;
  }
  if (!flowsFor(p, d.transport, d.security).includes(d.flow || "")) d.flow = "";
  if (d.hidden) d.listen = "127.0.0.1";
  if (d.security === "reality") d.useCleanIp = false; // REALITY cannot go through a CDN
  // clean IPs = Cloudflare/CDN edge addresses → only for CDN-able transports (TLS, or VMess over plain HTTP ports)
  if (d.useCleanIp && !(HTTP_TRANSPORTS.includes(d.transport) && (d.security === "tls" || (p === "vmess" && d.security === "none")))) d.useCleanIp = false;
  return warn;
}

export function normalizeTunnel(d: Record<string, any>): void {
  const c = String(d.carrier || "vless");
  if (d.mode === "reverse" && !REVERSE_CARRIERS.includes(c)) d.mode = "direct";
  if (d.mode === "reverse" && isXrayCarrier(c)) d.carrier = "vless";
  const tr = tunnelTransportsFor(d.carrier);
  if (!tr.includes(d.transport)) d.transport = tr[0];
  const sec = tunnelSecuritiesFor(d.carrier, d.transport);
  if (!sec.includes(d.security)) d.security = sec.includes("reality") ? "reality" : sec.includes("tls") ? "tls" : sec[0];
}
