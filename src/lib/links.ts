/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import { HTTP_TRANSPORTS, isXrayProtocol } from "@/lib/compat";
import { awgLines, inboundNode, loadCtx, nodeHost, userAllowed, type Ctx } from "@/lib/cores";
import { getSettings } from "@/lib/settings";
import { flag } from "@/lib/format";
import type { User } from "@/lib/users";

/** Protocol-neutral description of one client endpoint. Every export format renders from this. */
type Ep = {
  name: string; protocol: string; address: string; port: number;
  transport: string; security: string; sni: string; host: string; path: string; serviceName: string;
  flow: string; fp: string; alpn: string; pbk: string; sid: string; insecure: boolean; pcs: string;
  id: string; password: string; username: string;
  obfs: string; mport: string; earlyData: boolean;
  wg?: { privateKey: string; publicKey: string; address: string; mtu: number; dns: string; allowed: string; keepalive: number; awg: string; amnezia: boolean; confUrl: string };
  ovpnUrl?: string;
};

const enc = encodeURIComponent;
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

function endpoints(ctx: Ctx, u: User, origin: string): Ep[] {
  const out: Ep[] = [];
  const sec = ctx.sec, obf = ctx.obf;
  for (const ib of ctx.inbounds) {
    if (!userAllowed(ctx, u, ib.protocol)) continue;
    const node = inboundNode(ctx, ib);
    if (!node || (!node.isLocal && (!node.enabled || !isXrayProtocol(ib.protocol)))) continue;
    const address = nodeHost(ctx, node);
    if (!address) continue;
    const label = `${flag(node.countryCode)} ${ib.remark || ib.name}${node.isLocal ? "" : ` · ${node.name}`}`;
    const base: Ep = {
      name: label, protocol: ib.protocol, address, port: ib.port, transport: ib.transport, security: ib.security,
      sni: ib.sni || address, host: ib.host || "", path: ib.path || "/", serviceName: ib.serviceName || "", flow: ib.flow || "",
      fp: ib.fingerprint || sec.tls.fingerprint, alpn: ib.alpn || sec.tls.alpn, pbk: ib.publicKey || "", sid: ib.shortId || "",
      insecure: sec.tls.allowInsecure || sec.tls.certMode === "selfsigned", id: u.uuid, password: u.vpnPassword, username: u.username,
      obfs: "", mport: "", earlyData: sec.zeroRtt.wsEarlyData, pcs: "",
    };
    // Xray 26 removed allowInsecure: pin the server certificate instead (pcs=) when it is self-signed / unverifiable
    if (base.insecure) base.pcs = (sec.tls.pinSha256 || node.certSha256 || "").replace(/:/g, "").toLowerCase();
    if (isXrayProtocol(ib.protocol)) {
      if (ib.hidden && HTTP_TRANSPORTS.includes(ib.transport)) {
        if (!ctx.hidden.enabled) continue;
        Object.assign(base, { port: 443, security: "tls", sni: address, host: address });
      }
      if (base.security === "reality") { base.sni = ib.sni || (ib.realityDest || "").split(":")[0]; base.alpn = ""; }
      if (base.security === "tls" && ["ws", "httpupgrade", "xhttp"].includes(base.transport) && !base.host) base.host = address;
      const spoof = ib.sniSpoof || (sec.sniSpoof.enabled ? sec.sniSpoof.fakeSni : "");
      if (base.security === "tls" && spoof) { base.sni = spoof; base.insecure = true; base.pcs = (sec.tls.pinSha256 || "").replace(/:/g, "").toLowerCase(); if (sec.sniSpoof.fakeHost) base.host = sec.sniSpoof.fakeHost; }
      if (ib.protocol === "psiphon") base.protocol = "vless";
      const variants: Ep[] = [];
      const pool = ctx.cleanIps.filter((c) => !c.assigned || c.assigned.split(/[,\s]+/).some((x) => x && (x === String(ib.id) || x.toLowerCase() === ib.name.toLowerCase())));
      if (ib.useCleanIp && ctx.cleanip.auto && pool.length) {
        // Clean IP = Cloudflare/CDN edge address. The domain (SNI/Host) stays your CDN-proxied domain.
        const CF_TLS = [443, 2053, 2083, 2087, 2096, 8443], CF_HTTP = [80, 8080, 8880, 2052, 2082, 2086, 2095];
        const okPorts = base.security === "tls" ? CF_TLS : CF_HTTP;
        for (const c of pool.slice(0, Math.max(1, ctx.cleanip.maxIps))) {
          const port = okPorts.includes(c.port) ? c.port : okPorts.includes(base.port) ? base.port : okPorts[0];
          variants.push({ ...base, address: c.ip, port, pcs: "", insecure: base.insecure && !!spoof, name: `⚡ ${base.name} · ${c.ip}${c.latencyMs ? ` (${c.latencyMs}ms)` : ""}` });
        }
        if (ctx.cleanip.keepOriginal) variants.push(base);
      } else variants.push(base);
      out.push(...variants);
    } else if (ib.protocol === "hysteria2") {
      base.obfs = ib.obfs || obf.hysteriaObfsPassword;
      base.mport = obf.portHopping.enabled ? obf.portHopping.hopRange : "";
      base.alpn = "h3";
      out.push(base);
    } else if (ib.protocol === "wireguard") {
      if (!u.wgPrivateKey || !u.wgIp) continue;
      base.address = ctx.wg.endpointOverride || address;
      const awg = awgLines(ctx.wg);
      base.wg = { privateKey: u.wgPrivateKey, publicKey: ib.publicKey, address: `${u.wgIp}/32`, mtu: ctx.wg.mtu, dns: ctx.wg.clientDns, allowed: ctx.wg.allowedIps, keepalive: ctx.wg.persistentKeepalive, awg, amnezia: !!awg, confUrl: `${origin}/sub/${u.subToken}/wg` };
      if (awg) base.name = `${base.name} (AmneziaWG)`;
      out.push(base);
    } else if (ib.protocol === "openvpn") {
      base.ovpnUrl = `${origin}/sub/${u.subToken}/ovpn`;
      out.push(base);
    }
  }
  return out;
}

function fragmentParam(ctx: Ctx, e: Ep) {
  const f = ctx.obf.fragment;
  return f.enabled && e.security === "tls" ? `${f.packets},${f.length},${f.interval}` : "";
}

function toUri(ctx: Ctx, e: Ep): string {
  if (e.protocol === "openvpn") return e.ovpnUrl || "";
  if (e.protocol === "hysteria2") {
    const q = new URLSearchParams({ sni: e.sni, ...(e.insecure ? { insecure: "1", ...(e.pcs ? { pinSHA256: e.pcs } : {}) } : {}), ...(e.obfs ? { obfs: "salamander", "obfs-password": e.obfs } : {}), ...(e.mport ? { mport: e.mport } : {}) });
    return `hysteria2://${enc(e.username)}:${enc(e.password)}@${e.address}:${e.port}/?${q}#${enc(e.name)}`;
  }
  if (e.protocol === "wireguard" && e.wg?.amnezia) return e.wg.confUrl; // obfuscated → import the .conf into AmneziaWG / AmneziaVPN
  if (e.protocol === "wireguard" && e.wg) {
    const q = new URLSearchParams({ publickey: e.wg.publicKey, address: e.wg.address, mtu: String(e.wg.mtu) });
    return `wireguard://${enc(e.wg.privateKey)}@${e.address}:${e.port}?${q}#${enc(e.name)}`;
  }
  const path = e.earlyData && e.transport === "ws" ? `${e.path}?ed=2048` : e.path;
  if (e.protocol === "vmess") {
    return `vmess://${b64(JSON.stringify({ v: "2", ps: e.name, add: e.address, port: String(e.port), id: e.id, aid: "0", scy: "auto", net: e.transport, type: "none", host: e.host, path: e.transport === "grpc" ? e.serviceName : path, tls: e.security === "tls" ? "tls" : "", sni: e.security === "tls" ? e.sni : "", alpn: e.security === "tls" ? e.alpn : "", fp: e.fp, ...(e.insecure ? { allowInsecure: "1" } : {}) }))}`;
  }
  const q: Record<string, string> = { type: e.transport, security: e.security };
  if (e.protocol === "vless") q.encryption = "none";
  if (["ws", "httpupgrade", "xhttp"].includes(e.transport)) { q.path = path; if (e.host) q.host = e.host; }
  if (e.transport === "grpc") { q.serviceName = e.serviceName; q.mode = "gun"; }
  if (e.transport === "xhttp") q.mode = "auto";
  if (e.security === "tls" || e.security === "reality") { q.sni = e.sni; q.fp = e.fp; }
  if (e.security === "tls" && e.alpn) q.alpn = e.alpn;
  if (e.security === "tls" && e.insecure) q.allowInsecure = "1";
  if (e.security === "tls" && e.pcs) q.pcs = e.pcs;
  if (e.security === "reality") { q.pbk = e.pbk; q.sid = e.sid; q.spx = "/"; }
  if (e.flow) q.flow = e.flow;
  const frag = fragmentParam(ctx, e);
  if (frag) q.fragment = frag;
  const cred = e.protocol === "trojan" ? enc(e.password) : e.id;
  return `${e.protocol}://${cred}@${e.address}:${e.port}?${new URLSearchParams(q)}#${enc(e.name)}`;
}

export async function userLinks(u: User, origin: string, ctxIn?: Ctx) {
  const ctx = ctxIn || (await loadCtx());
  return endpoints(ctx, u, origin).map((e) => ({ name: e.name, protocol: e.protocol, uri: toUri(ctx, e) })).filter((l) => l.uri);
}

// ---------------------------------------------------------------- clash (mihomo)
const y = (v: unknown) => JSON.stringify(v);
function clashProxy(e: Ep): string | null {
  const head = `  - name: ${y(e.name)}\n    server: ${y(e.address)}\n    port: ${e.port}\n    udp: true`;
  if (e.protocol === "hysteria2") return `${head}\n    type: hysteria2\n    password: ${y(`${e.username}:${e.password}`)}\n    sni: ${y(e.sni)}\n    skip-cert-verify: ${e.insecure}${e.obfs ? `\n    obfs: salamander\n    obfs-password: ${y(e.obfs)}` : ""}${e.mport ? `\n    ports: ${y(e.mport)}` : ""}`;
  if (e.protocol === "wireguard" && e.wg) {
    const a = Object.fromEntries(e.wg.awg.split("\n").filter(Boolean).map((l) => { const [k, v] = l.split(" = "); return [k.toLowerCase(), Number(v)]; }));
    return `${head}\n    type: wireguard\n    ip: ${y(e.wg.address.split("/")[0])}\n    private-key: ${y(e.wg.privateKey)}\n    public-key: ${y(e.wg.publicKey)}\n    mtu: ${e.wg.mtu}${e.wg.amnezia ? `\n    amnezia-wg-option:\n${Object.entries(a).map(([k, v]) => `      ${k}: ${v}`).join("\n")}` : ""}`;
  }
  if (!["vless", "vmess", "trojan"].includes(e.protocol)) return null;
  if (e.transport === "xhttp") return null; // not supported by mihomo
  let s = `${head}\n    type: ${e.protocol}\n    network: ${e.transport === "httpupgrade" ? "ws" : e.transport}`;
  if (e.protocol === "vless") s += `\n    uuid: ${y(e.id)}${e.flow ? `\n    flow: ${e.flow}` : ""}`;
  if (e.protocol === "vmess") s += `\n    uuid: ${y(e.id)}\n    alterId: 0\n    cipher: auto`;
  if (e.protocol === "trojan") s += `\n    password: ${y(e.password)}`;
  if (e.security !== "none") s += `\n    tls: true\n    servername: ${y(e.sni)}\n    client-fingerprint: ${e.fp === "random" || e.fp === "randomized" ? "random" : e.fp}\n    skip-cert-verify: ${e.insecure}`;
  if (e.security === "reality") s += `\n    reality-opts:\n      public-key: ${y(e.pbk)}\n      short-id: ${y(e.sid)}`;
  if (e.transport === "ws" || e.transport === "httpupgrade") s += `\n    ws-opts:\n      path: ${y(e.path)}\n      headers:\n        Host: ${y(e.host || e.sni)}${e.transport === "httpupgrade" ? "\n      v2ray-http-upgrade: true" : ""}`;
  if (e.transport === "grpc") s += `\n    grpc-opts:\n      grpc-service-name: ${y(e.serviceName)}`;
  return s;
}

function clashYaml(ctx: Ctx, eps: Ep[], title: string): string {
  const px = eps.map((e) => ({ e, s: clashProxy(e) })).filter((x) => x.s);
  const names = px.map((x) => y(x.e.name));
  const rules = [
    ...(ctx.routing.blockAds ? ["GEOSITE,category-ads-all,REJECT"] : []),
    "GEOIP,private,DIRECT,no-resolve",
    ...(ctx.routing.directIran ? ["GEOSITE,ir,DIRECT", "GEOIP,IR,DIRECT"] : []),
    ...(ctx.routing.directChina ? ["GEOIP,CN,DIRECT"] : []),
    ...(ctx.routing.directRussia ? ["GEOIP,RU,DIRECT"] : []),
    `MATCH,${title}`,
  ];
  return `# ${title}\nmixed-port: 7890\nallow-lan: false\nmode: rule\nlog-level: warning\nipv6: true\ndns:\n  enable: true\n  enhanced-mode: fake-ip\n  nameserver:\n${ctx.dns.doh.servers.split("\n").filter(Boolean).map((s) => `    - ${s.trim()}`).join("\n") || "    - https://1.1.1.1/dns-query"}\nproxies:\n${px.map((x) => x.s).join("\n") || "  []"}\nproxy-groups:\n  - name: ${y(title)}\n    type: select\n    proxies: [${["⚡ Auto", ...names.map((n) => JSON.parse(n))].map((n) => y(n)).join(", ")}]\n  - name: "⚡ Auto"\n    type: url-test\n    url: https://www.gstatic.com/generate_204\n    interval: 300\n    proxies: [${names.join(", ") || "DIRECT"}]\nrules:\n${rules.map((r) => `  - ${r}`).join("\n")}\n`;
}

// ---------------------------------------------------------------- sing-box
function singOutbound(ctx: Ctx, e: Ep): any | null {
  const tls = e.security === "none" ? undefined : {
    enabled: true, server_name: e.sni, insecure: e.insecure,
    ...(e.alpn && e.security === "tls" ? { alpn: e.alpn.split(",") } : {}),
    utls: { enabled: true, fingerprint: e.fp === "randomized" ? "random" : e.fp },
    ...(e.security === "reality" ? { reality: { enabled: true, public_key: e.pbk, short_id: e.sid } } : {}),
    ...(ctx.obf.fragment.enabled && e.security === "tls" ? { fragment: true } : {}),
  };
  if (e.protocol === "hysteria2") return { type: "hysteria2", tag: e.name, server: e.address, server_port: e.port, password: `${e.username}:${e.password}`, ...(e.mport ? { server_ports: [e.mport.replace("-", ":")] } : {}), ...(e.obfs ? { obfs: { type: "salamander", password: e.obfs } } : {}), tls: { enabled: true, server_name: e.sni, insecure: e.insecure, alpn: ["h3"] } };
  if (e.protocol === "wireguard" && e.wg?.amnezia) return null; // sing-box has no AmneziaWG support
  if (e.protocol === "wireguard" && e.wg) return { type: "wireguard", tag: e.name, server: e.address, server_port: e.port, local_address: [e.wg.address], private_key: e.wg.privateKey, peer_public_key: e.wg.publicKey, mtu: e.wg.mtu };
  if (!["vless", "vmess", "trojan"].includes(e.protocol) || e.transport === "xhttp") return null;
  const transport = e.transport === "ws" ? { type: "ws", path: e.path, headers: { Host: e.host || e.sni }, ...(e.earlyData ? { max_early_data: 2048, early_data_header_name: "Sec-WebSocket-Protocol" } : {}) } : e.transport === "grpc" ? { type: "grpc", service_name: e.serviceName } : e.transport === "httpupgrade" ? { type: "httpupgrade", path: e.path, host: e.host || e.sni } : undefined;
  const cred = e.protocol === "trojan" ? { password: e.password } : e.protocol === "vmess" ? { uuid: e.id, security: "auto", alter_id: 0 } : { uuid: e.id, ...(e.flow ? { flow: e.flow } : {}) };
  return { type: e.protocol, tag: e.name, server: e.address, server_port: e.port, ...cred, ...(tls ? { tls } : {}), ...(transport ? { transport } : {}), ...(ctx.obf.mux.enabled && !e.flow ? { multiplex: { enabled: true, protocol: "h2mux", max_connections: 4 } } : {}) };
}

function singbox(ctx: Ctx, eps: Ep[]): string {
  const outs = eps.map((e) => singOutbound(ctx, e)).filter(Boolean);
  const tags = outs.map((o) => o.tag);
  const rules: any[] = [{ ip_is_private: true, outbound: "direct" }];
  if (ctx.routing.directIran) rules.push({ domain_suffix: [".ir"], outbound: "direct" });
  return JSON.stringify({
    log: { level: "warn" },
    dns: { servers: [{ tag: "remote", address: ctx.dns.doh.servers.split("\n")[0]?.trim() || "https://1.1.1.1/dns-query", detour: "proxy" }, { tag: "local", address: "local", detour: "direct" }], final: "remote" },
    inbounds: [{ type: "tun", tag: "tun-in", address: ["172.19.0.1/30"], auto_route: true, strict_route: true, stack: "mixed" }, { type: "mixed", tag: "mixed-in", listen: "127.0.0.1", listen_port: 2080 }],
    outbounds: [{ type: "selector", tag: "proxy", outbounds: ["auto", ...tags] }, { type: "urltest", tag: "auto", outbounds: tags.length ? tags : ["direct"], url: "https://www.gstatic.com/generate_204", interval: "5m" }, ...outs, { type: "direct", tag: "direct" }],
    route: { rules, final: "proxy", auto_detect_interface: true },
  }, null, 2);
}

// ---------------------------------------------------------------- xray client JSON
function xrayClient(ctx: Ctx, e: Ep): any | null {
  if (!["vless", "vmess", "trojan"].includes(e.protocol)) return null;
  const st: any = { network: e.transport, security: e.security };
  if (e.transport === "ws") st.wsSettings = { path: e.earlyData ? `${e.path}?ed=2048` : e.path, host: e.host };
  if (e.transport === "httpupgrade") st.httpupgradeSettings = { path: e.path, host: e.host };
  if (e.transport === "xhttp") st.xhttpSettings = { path: e.path, host: e.host, mode: "auto" };
  if (e.transport === "grpc") st.grpcSettings = { serviceName: e.serviceName };
  if (e.security === "tls") st.tlsSettings = { serverName: e.sni, fingerprint: e.fp, alpn: e.alpn.split(","), ...(e.pcs ? { pinnedPeerCertSha256: e.pcs } : {}), ...(ctx.sec.ech.enabled && ctx.sec.ech.configList ? { echConfigList: ctx.sec.ech.configList } : {}) };
  if (e.security === "reality") st.realitySettings = { serverName: e.sni, fingerprint: e.fp, publicKey: e.pbk, shortId: e.sid, spiderX: "/" };
  const user = e.protocol === "trojan" ? { password: e.password } : e.protocol === "vmess" ? { id: e.id, security: "auto" } : { id: e.id, encryption: "none", ...(e.flow ? { flow: e.flow } : {}) };
  const proxy: any = { tag: "proxy", protocol: e.protocol, settings: e.protocol === "trojan" ? { servers: [{ address: e.address, port: e.port, ...user }] } : { vnext: [{ address: e.address, port: e.port, users: [user] }] }, streamSettings: st };
  if (ctx.obf.mux.enabled && !e.flow) proxy.mux = { enabled: true, concurrency: ctx.obf.mux.concurrency };
  const outbounds: any[] = [proxy, { tag: "direct", protocol: "freedom" }, { tag: "block", protocol: "blackhole" }];
  const f = ctx.obf.fragment, n = ctx.obf.noise;
  if ((f.enabled && e.security === "tls") || n.enabled) {
    outbounds.push({ tag: "frag", protocol: "freedom", settings: { ...(f.enabled ? { fragment: { packets: f.packets, length: f.length, interval: f.interval } } : {}), ...(n.enabled ? { noises: [{ type: "rand", packet: n.packet.replace(/^rand:/, ""), delay: n.delay }] } : {}) } });
    proxy.streamSettings.sockopt = { dialerProxy: "frag" };
  }
  return {
    remarks: e.name,
    log: { loglevel: "warning" },
    dns: { servers: ctx.dns.doh.servers.split("\n").filter(Boolean).map((s) => s.trim()) },
    inbounds: [{ tag: "socks", port: 10808, listen: "127.0.0.1", protocol: "socks", settings: { udp: true }, sniffing: { enabled: true, destOverride: ["http", "tls"] } }, { tag: "http", port: 10809, listen: "127.0.0.1", protocol: "http" }],
    outbounds,
    routing: { domainStrategy: "IPIfNonMatch", rules: [{ type: "field", ip: ["geoip:private"], outboundTag: "direct" }, ...(ctx.routing.directIran ? [{ type: "field", domain: ["geosite:ir", "regexp:\\.ir$"], outboundTag: "direct" }, { type: "field", ip: ["geoip:ir"], outboundTag: "direct" }] : []), ...(ctx.routing.blockAds ? [{ type: "field", domain: ["geosite:category-ads-all"], outboundTag: "block" }] : [])] },
  };
}

// ---------------------------------------------------------------- files
function wgFile(e: Ep): string {
  const w = e.wg!;
  return `# ${e.name}${w.amnezia ? "\n# Import into AmneziaWG or AmneziaVPN (obfuscated WireGuard)" : ""}\n[Interface]\nPrivateKey = ${w.privateKey}\nAddress = ${w.address}\nDNS = ${w.dns}\nMTU = ${w.mtu}\n${w.awg}\n[Peer]\nPublicKey = ${w.publicKey}\nAllowedIPs = ${w.allowed}\nEndpoint = ${e.address}:${e.port}\nPersistentKeepalive = ${w.keepalive}\n`;
}

function ovpnFile(ctx: Ctx, e: Ep): string {
  const read = (f: string) => { try { return fs.readFileSync(f, "utf8").trim(); } catch { return ""; } };
  const ca = read("/etc/vvsm/openvpn/ca.crt");
  const tc = read("/etc/vvsm/openvpn/tc.key");
  const ib = ctx.inbounds.find((i) => i.protocol === "openvpn");
  return `# ${e.name}\n# Username: ${e.username}\n# Password: ${e.password}   (your account password also works)\nclient\ndev tun\nproto ${ib?.transport === "tcp" ? "tcp" : "udp"}\nremote ${e.address} ${e.port}\nresolv-retry infinite\nnobind\npersist-key\npersist-tun\nremote-cert-tls server\nsetenv CLIENT_CERT 0\nauth-user-pass\nauth SHA256\ndata-ciphers AES-256-GCM:AES-128-GCM:CHACHA20-POLY1305\ntls-version-min 1.2\nverb 3\n${ca ? `<ca>\n${ca}\n</ca>\n` : "# CA certificate is created by install.sh on the server\n"}${tc ? `<tls-crypt>\n${tc}\n</tls-crypt>\n` : ""}`;
}

export async function buildSubscription(u: User, format: string, origin: string): Promise<{ body: string; type: string; headers: Record<string, string> }> {
  const ctx = await loadCtx();
  const sub = await getSettings("subscription");
  const eps = endpoints(ctx, u, origin);
  const title = sub.profileTitle || ctx.gen.siteName;
  const headers: Record<string, string> = {
    "subscription-userinfo": `upload=0; download=${u.usedBytes}; total=${u.dataLimitBytes}; expire=${u.expiresAt ? Math.floor(new Date(u.expiresAt).getTime() / 1000) : 0}`,
    "profile-title": `base64:${b64(title)}`,
    "profile-update-interval": String(sub.updateIntervalHours || 12),
    "profile-web-page-url": `${origin}/s/${u.subToken}`,
    ...(sub.supportLink || ctx.gen.supportUrl ? { "support-url": sub.supportLink || ctx.gen.supportUrl } : {}),
    "cache-control": "no-store",
  };
  const proxyUris = () => eps.filter((e) => e.protocol !== "openvpn").map((e) => toUri(ctx, e)).filter(Boolean);
  switch (format) {
    case "links":
      return { body: proxyUris().join("\n"), type: "text/plain; charset=utf-8", headers };
    case "clash":
      return { body: clashYaml(ctx, eps, title), type: "text/yaml; charset=utf-8", headers: { ...headers, "content-disposition": `attachment; filename="${u.username}.yaml"` } };
    case "singbox":
      return { body: singbox(ctx, eps), type: "application/json; charset=utf-8", headers };
    case "xray":
      return { body: JSON.stringify(eps.map((e) => xrayClient(ctx, e)).filter(Boolean), null, 2), type: "application/json; charset=utf-8", headers };
    case "wg": {
      const e = eps.find((x) => x.protocol === "wireguard");
      return { body: e ? wgFile(e) : "# WireGuard is not included in your plan", type: "text/plain; charset=utf-8", headers: { ...headers, "content-disposition": `attachment; filename="${u.username}-wg.conf"` } };
    }
    case "ovpn": {
      const e = eps.find((x) => x.protocol === "openvpn");
      return { body: e ? ovpnFile(ctx, e) : "# OpenVPN is not included in your plan", type: "application/x-openvpn-profile", headers: { ...headers, "content-disposition": `attachment; filename="${u.username}.ovpn"` } };
    }
    default:
      return { body: b64(proxyUris().join("\n")), type: "text/plain; charset=utf-8", headers };
  }
}
