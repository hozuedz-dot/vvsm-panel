/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import fsp from "fs/promises";
import crypto from "crypto";
import os from "os";
import path from "path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cleanIps, inbounds, nodes, plans, routingRules, tunnels, users } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { isUsable } from "@/lib/users";
import { sha256 } from "@/lib/keys";
import { run } from "@/lib/system";
import { logEvent } from "@/lib/telegram";
import { HTTP_TRANSPORTS, isXrayCarrier, isXrayProtocol } from "@/lib/compat";
import { M } from "@/lib/msg";

export const CONF = {
  xray: "/usr/local/etc/xray/config.json",
  hysteria: "/etc/hysteria/config.yaml",
  wg: "/etc/amnezia/amneziawg/awg0.conf",
  ovpn: "/etc/openvpn/server/vvsm.conf",
  psiphon: "/etc/vvsm/psiphon.config",
  nginx: "/etc/vvsm/nginx-routes.conf",
  wgLimits: "/etc/vvsm/wg-limits.sh",
};
const GENERATED = path.join(process.cwd(), "data", "generated");
export const HY_STATS = "127.0.0.1:25413";
export const XRAY_API = "127.0.0.1:10085";

/** Shared secret for localhost-only callbacks (OpenVPN auth script, Hysteria stats). Mirrors scripts/ovpn-auth.sh. */
export const internalKey = () => sha256(`int:${process.env.SESSION_SECRET || ""}`).slice(0, 32);

export type Step = { name: string; status: "applied" | "skipped" | "error" | "info"; detail?: string };

// ---------------------------------------------------------------- context
export async function loadCtx() {
  const [gen, sec, obf, routing, dns, hidden, psiphon, wg, cleanip, limits] = await Promise.all([
    getSettings("general"), getSettings("security"), getSettings("obfuscation"), getSettings("routing"), getSettings("dns"),
    getSettings("hidden"), getSettings("psiphon"), getSettings("wireguard"), getSettings("cleanip"), getSettings("limits"),
  ]);
  const [ibs, nds, tns, rules, ips, us, pls] = await Promise.all([
    db.select().from(inbounds), db.select().from(nodes), db.select().from(tunnels), db.select().from(routingRules),
    db.select().from(cleanIps).where(eq(cleanIps.status, "clean")), db.select().from(users), db.select().from(plans),
  ]);
  const local = nds.find((n) => n.isLocal) || nds[0];
  if (local) local.certSha256 = certSha256(sec.tls.certPath) || local.certSha256;
  return {
    gen, sec, obf, routing, dns, hidden, psiphon, wg, cleanip, limits,
    inbounds: ibs.filter((i) => i.enabled), allInbounds: ibs, nodes: nds, tunnels: tns, rules: rules.filter((r) => r.enabled).sort((a, b) => a.priority - b.priority),
    cleanIps: ips.sort((a, b) => a.latencyMs - b.latencyMs), users: us, activeUsers: us.filter(isUsable), plans: pls, local,
  };
}
export type Ctx = Awaited<ReturnType<typeof loadCtx>>;
type Inbound = Ctx["inbounds"][number];
type Node = Ctx["nodes"][number];
type Tunnel = Ctx["tunnels"][number];
type U = Ctx["users"][number];

/** SHA-256 (hex) of the leaf certificate — used for Xray 26 `pinnedPeerCertSha256` instead of the removed allowInsecure. */
export function certSha256(file: string): string {
  try {
    const pem = fs.readFileSync(file, "utf8");
    const first = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/.exec(pem)?.[0];
    if (!first) return "";
    return new crypto.X509Certificate(first).fingerprint256.replace(/:/g, "").toLowerCase();
  } catch {
    return "";
  }
}

export function nodeHost(ctx: Ctx, n: Node | undefined): string {
  if (!n) return ctx.sec.domainsPorts.panelDomain || ctx.gen.domain;
  if (n.isLocal) return ctx.sec.domainsPorts.panelDomain || ctx.gen.domain || n.domain || n.ip;
  return n.domain || n.ip;
}
const nodeById = (ctx: Ctx, id: number | null | undefined) => (id ? ctx.nodes.find((n) => n.id === id) : ctx.local);
export const tunnelEntry = (ctx: Ctx, t: Tunnel) => nodeById(ctx, t.entryNodeId);
export const tunnelExit = (ctx: Ctx, t: Tunnel) => nodeById(ctx, t.exitNodeId);

/** The node that actually serves an inbound: a tunnelled inbound always lives on the tunnel's entry node. */
export function inboundNode(ctx: Ctx, ib: Inbound): Node | undefined {
  if (ib.tunnelId) {
    const t = ctx.tunnels.find((x) => x.id === ib.tunnelId);
    if (t) return tunnelEntry(ctx, t);
  }
  return nodeById(ctx, ib.nodeId);
}

export function userAllowed(ctx: Ctx, u: U, protocol: string): boolean {
  const plan = u.planId ? ctx.plans.find((p) => p.id === u.planId) : null;
  const list = (plan?.protocols as string[] | undefined) || [];
  return !list.length || list.includes(protocol);
}

// ---------------------------------------------------------------- geo assets
const geoCache: Record<string, { mtime: number; buf: Buffer } | null> = {};
function geoFile(kind: "geoip" | "geosite") {
  const f = `/usr/local/share/xray/${kind}.dat`;
  try {
    const st = fs.statSync(f);
    const c = geoCache[f];
    if (c && c.mtime === st.mtimeMs) return c.buf;
    const buf = fs.readFileSync(f);
    geoCache[f] = { mtime: st.mtimeMs, buf };
    return buf;
  } catch {
    return null;
  }
}
/** Drop geosite:/geoip: tags that are not inside the installed .dat files (prevents `xray -test` failures). */
function geoFilter(list: string[], warn: string[]): string[] {
  return list.filter((v) => {
    const m = /^(geosite|geoip):(!?)([\w.@!-]+)/i.exec(v);
    if (!m) return true;
    const buf = geoFile(m[1].toLowerCase() as "geoip" | "geosite");
    if (!buf) return true;
    const tag = m[3].split("@")[0].toUpperCase();
    if (buf.includes(Buffer.from(tag)) || buf.includes(Buffer.from(tag.toLowerCase()))) return true;
    warn.push(`${v} not in installed geo file — skipped`);
    return false;
  });
}

// ---------------------------------------------------------------- xray
function streamFor(ctx: Ctx, o: { transport: string; security: string; path: string; host: string; serviceName: string; sni: string; alpn?: string; fingerprint?: string; privateKey?: string; shortId?: string; realityDest?: string; certPath?: string; keyPath?: string; hidden?: boolean; pin?: string }, server: boolean) {
  const s: any = { network: o.transport === "tcp" ? "tcp" : o.transport };
  const p = o.path && o.path.startsWith("/") ? o.path : `/${o.path || ""}`;
  if (o.transport === "ws") s.wsSettings = { path: p, ...(o.host ? { host: o.host } : {}) };
  if (o.transport === "httpupgrade") s.httpupgradeSettings = { path: p, ...(o.host ? { host: o.host } : {}) };
  if (o.transport === "grpc") s.grpcSettings = { serviceName: o.serviceName || p.slice(1) || "grpc" };
  if (o.transport === "xhttp") s.xhttpSettings = { path: p, mode: "auto", ...(o.host ? { host: o.host } : {}), ...(ctx.obf.padding.enabled ? { xPaddingBytes: ctx.obf.padding.length } : {}) };
  if (o.transport === "tcp" && o.security === "none" && ctx.obf.httpHeaderObfs.enabled)
    s.tcpSettings = { header: { type: "http", request: { path: ["/"], headers: { Host: [ctx.obf.httpHeaderObfs.fakeHost] } } } };
  const security = o.hidden ? "none" : o.security;
  s.security = security;
  if (security === "tls") {
    const tls = ctx.sec.tls;
    s.tlsSettings = server
      ? { serverName: o.sni || undefined, minVersion: tls.minVersion, maxVersion: tls.maxVersion, alpn: (o.alpn || tls.alpn).split(",").map((x) => x.trim()).filter(Boolean), certificates: [{ certificateFile: o.certPath || tls.certPath, keyFile: o.keyPath || tls.keyPath }], ...(ctx.sec.ech.enabled && ctx.sec.ech.serverKeys ? { echServerKeys: ctx.sec.ech.serverKeys } : {}) }
      : { serverName: o.sni, fingerprint: o.fingerprint || tls.fingerprint, ...(o.pin ? { pinnedPeerCertSha256: o.pin } : {}) };
  }
  if (security === "reality") {
    const dest = o.realityDest || "www.microsoft.com:443";
    s.realitySettings = server
      ? { show: false, dest, xver: 0, serverNames: [o.sni || dest.split(":")[0]], privateKey: o.privateKey, shortIds: [o.shortId || "", ""].filter((v, i, a) => a.indexOf(v) === i) }
      : { serverName: o.sni || dest.split(":")[0], fingerprint: o.fingerprint || "chrome", publicKey: o.privateKey, shortId: o.shortId || "", spiderX: "/" };
  }
  if (server && ctx.sec.zeroRtt.tcpFastOpen && o.transport !== "xhttp") s.sockopt = { tcpFastOpen: true };
  return s;
}

function clientsFor(ctx: Ctx, ib: Inbound) {
  const proto = ib.protocol === "psiphon" ? "vless" : ib.protocol;
  return ctx.activeUsers
    .filter((u) => userAllowed(ctx, u, ib.protocol))
    .map((u) => (proto === "trojan" ? { password: u.vpnPassword, email: u.username } : proto === "vmess" ? { id: u.uuid, email: u.username } : { id: u.uuid, email: u.username, ...(ib.flow ? { flow: ib.flow } : {}) }));
}

function deepMerge(a: any, b: any): any {
  if (!b || typeof b !== "object" || Array.isArray(b)) return b === undefined ? a : b;
  const out = { ...(a || {}) };
  for (const k of Object.keys(b)) out[k] = deepMerge(out[k], b[k]);
  return out;
}

function xrayInbound(ctx: Ctx, ib: Inbound) {
  const proto = ib.protocol === "psiphon" ? "vless" : ib.protocol;
  const clients = clientsFor(ctx, ib);
  const settings: any = proto === "vless" ? { clients, decryption: "none" } : { clients };
  const hidden = ib.hidden && HTTP_TRANSPORTS.includes(ib.transport);
  const base = {
    tag: `in-${ib.id}`,
    listen: hidden ? "127.0.0.1" : ib.listen || "0.0.0.0",
    port: ib.port,
    protocol: proto,
    settings,
    streamSettings: streamFor(ctx, { ...ib, hidden }, true),
    sniffing: { enabled: true, destOverride: ["http", "tls", "quic", ...(ctx.dns.fakeDns.enabled ? ["fakedns"] : [])], routeOnly: !ctx.dns.fakeDns.enabled },
  };
  return deepMerge(base, ib.advancedOptions || {});
}

const tunnelFlow = (t: Tunnel) => (t.carrier === "vless" && !t.mux && t.transport === "tcp" && t.security !== "none" ? "xtls-rprx-vision" : "");

function tunnelPeer(t: Tunnel) {
  try { return JSON.parse(t.secret || "{}") as { exitPrivateKey?: string; exitPublicKey?: string }; } catch { return {}; }
}
export const tunnelLocalPort = (t: Tunnel) => 20000 + (t.id % 20000);
export const tunnelNet = (t: Tunnel, base: number) => `10.${base}.${Math.floor(t.id / 250) % 250}.${(t.id % 250)}`;
export const tunnelOutTag = (t: Tunnel) => (t.mode === "reverse" ? `portal-${t.id}` : `tunnel-${t.id}`);

function tunnelServerInbound(ctx: Ctx, t: Tunnel, reverseTag?: string) {
  const c = t.carrier;
  // Xray 26 "VLESS Reverse Proxy": the bridge's client entry carries reverse.tag, which becomes an outbound on this server
  const clients = c === "trojan" ? [{ password: t.secret, email: `tunnel-${t.id}` }] : c === "vmess" ? [{ id: t.secret, email: `tunnel-${t.id}` }] : [{ id: t.secret, email: `tunnel-${t.id}`, ...(tunnelFlow(t) ? { flow: tunnelFlow(t) } : {}), ...(reverseTag ? { reverse: { tag: reverseTag } } : {}) }];
  return {
    tag: `tun-in-${t.id}`, listen: "0.0.0.0", port: t.listenPort, protocol: c,
    settings: c === "vless" ? { clients, decryption: "none" } : { clients },
    streamSettings: streamFor(ctx, { transport: t.transport, security: t.security, path: t.path, host: t.host, serviceName: t.serviceName, sni: t.sni, privateKey: t.privateKey, shortId: t.shortId, realityDest: t.realityDest, certPath: t.certPath, keyPath: t.keyPath }, true),
    sniffing: { enabled: true, destOverride: ["http", "tls"], routeOnly: true },
  };
}

function tunnelClientOutbound(ctx: Ctx, t: Tunnel, tag: string, address: string, server: Node | undefined, warn: string[], reverseTag?: string) {
  const c = t.carrier;
  const user = c === "trojan" ? { password: t.secret } : c === "vmess" ? { id: t.secret, security: "auto" } : { id: t.secret, encryption: "none", ...(tunnelFlow(t) ? { flow: tunnelFlow(t) } : {}) };
  const pin = t.security === "tls" ? server?.certSha256 || "" : "";
  if (t.security === "tls" && !pin) warn.push(`tunnel #${t.id}: certificate hash of "${server?.name}" not known yet (agent not reporting) — TLS will verify by name; REALITY is recommended`);
  const settings = reverseTag
    ? { address, port: t.listenPort, ...user, reverse: { tag: reverseTag } } // simplified VLESS outbound required by the reverse feature
    : c === "trojan" ? { servers: [{ address, port: t.listenPort, ...user }] } : { vnext: [{ address, port: t.listenPort, users: [user] }] };
  const st = streamFor(ctx, { transport: t.transport, security: t.security, path: t.path, host: t.host, serviceName: t.serviceName, sni: t.sni || address, fingerprint: t.fingerprint, privateKey: t.publicKey, shortId: t.shortId, realityDest: t.realityDest, pin }, false);
  return { tag, protocol: c, settings, streamSettings: st, ...(t.mux && t.mode !== "reverse" ? { mux: { enabled: true, concurrency: 8 } } : {}) };
}

/** Everything a node needs for the tunnels it participates in. */
function tunnelParts(ctx: Ctx, node: Node, warn: string[]) {
  const ins: any[] = [], outs: any[] = [], rules: any[] = [], bridges: any[] = [], portals: any[] = [];
  const entryTags: string[] = [];
  const used = new Set(ctx.inbounds.filter((ib) => isXrayProtocol(ib.protocol) && inboundNode(ctx, ib)?.id === node.id && !ib.hidden).map((ib) => ib.port));
  if (node.isLocal) { used.add(80); used.add(443); }
  for (const t of ctx.tunnels.filter((x) => x.enabled)) {
    const entry = tunnelEntry(ctx, t), exit = tunnelExit(ctx, t);
    if (!entry || !exit) { warn.push(`tunnel #${t.id}: entry/exit node missing`); continue; }
    if (entry.id === exit.id) { warn.push(`tunnel #${t.id}: entry and exit are the same node`); continue; }
    const isEntry = entry.id === node.id, isExit = exit.id === node.id;
    if (!isEntry && !isExit) continue;
    const hostsPort = isXrayCarrier(t.carrier) && ((t.mode === "reverse" && isEntry) || (t.mode !== "reverse" && isExit));
    if (hostsPort) {
      if (used.has(t.listenPort)) { warn.push(`tunnel #${t.id} "${t.name}": port ${t.listenPort} already used on "${node.name}" — tunnel skipped (change its port)`); continue; }
      used.add(t.listenPort);
    }
    if (isXrayCarrier(t.carrier)) {
      if (t.mode === "reverse") {
        if (isEntry) {
          // portal (public, usually Iran): users' traffic is routed to outbound "portal-ID", served by the bridge's reverse connection
          ins.push(tunnelServerInbound(ctx, t, `portal-${t.id}`));
          entryTags.push(`portal-${t.id}`);
        }
        if (isExit) {
          // bridge (abroad): dials the portal and exits whatever arrives through "bridge-ID" directly
          outs.push(tunnelClientOutbound(ctx, t, `tunnel-${t.id}`, nodeHost(ctx, entry), entry, warn, `bridge-${t.id}`));
          rules.push({ type: "field", inboundTag: [`bridge-${t.id}`], outboundTag: "direct" });
        }
      } else {
        if (isExit) {
          ins.push(tunnelServerInbound(ctx, t));
          rules.push({ type: "field", inboundTag: [`tun-in-${t.id}`], outboundTag: "direct" });
        }
        if (isEntry) {
          outs.push(tunnelClientOutbound(ctx, t, `tunnel-${t.id}`, nodeHost(ctx, exit), exit, warn));
          entryTags.push(`tunnel-${t.id}`);
        }
      }
      continue;
    }
    // non-Xray carriers: only the entry needs an Xray outbound; the transport itself is installed by /api/tunnel/script
    if (!isEntry) continue;
    if (t.carrier === "wireguard") {
      // AmneziaWG interface on the entry (installed by the tunnel script); Xray binds to the tunnel address → policy routing
      outs.push({ tag: `tunnel-${t.id}`, protocol: "freedom", sendThrough: tunnelNet(t, 250), settings: {} });
    } else if (t.carrier === "openvpn") {
      outs.push({ tag: `tunnel-${t.id}`, protocol: "freedom", sendThrough: tunnelNet(t, 251), settings: {} });
    } else {
      outs.push({ tag: `tunnel-${t.id}`, protocol: "socks", settings: { servers: [{ address: "127.0.0.1", port: tunnelLocalPort(t) }] } });
    }
    entryTags.push(`tunnel-${t.id}`);
  }
  return { ins, outs, rules, bridges, portals, entryTags };
}

const ANTI_DNS: Record<string, string[]> = { shecan: ["178.22.122.100", "185.51.200.2"], "403": ["10.202.10.202", "10.202.10.102"], electro: ["78.157.42.100", "78.157.42.101"], radar: ["10.202.10.10", "10.202.10.11"] };
const lines = (s: string) => String(s || "").split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);

function buildDns(ctx: Ctx, warn: string[]) {
  const d = ctx.dns;
  const servers: any[] = [];
  if (d.fakeDns.enabled) servers.push("fakedns");
  if (d.antiCensor.enabled) {
    const ips = d.antiCensor.provider === "custom" ? lines(d.antiCensor.servers) : ANTI_DNS[d.antiCensor.provider] || [];
    const domains = geoFilter(lines(d.antiCensor.domains), warn);
    for (const ip of ips) servers.push({ address: ip, domains, skipFallback: true });
  }
  if (d.doh.enabled) for (const s of lines(d.doh.servers)) servers.push(s.replace(/^https:\/\//, "https+local://"));
  servers.push("localhost");
  const hosts: Record<string, string> = {};
  if (d.local.enabled) for (const l of String(d.local.hosts || "").split("\n")) {
    const [a, b] = l.trim().split(/\s+/);
    if (!a || !b || a.startsWith("#")) continue;
    if (/^[\d.:a-f]+$/i.test(a)) hosts[b] = a; else hosts[a] = b;
  }
  return { servers, ...(Object.keys(hosts).length ? { hosts } : {}), queryStrategy: d.queryStrategy, disableCache: d.disableCache };
}

export async function buildXrayConfig(nodeId: number | null, ctxIn?: Ctx, warnOut?: string[]): Promise<string> {
  const ctx = ctxIn || (await loadCtx());
  const warn: string[] = warnOut || [];
  const node = nodeById(ctx, nodeId) || ctx.local;
  const r = ctx.routing;
  const myInbounds = ctx.inbounds.filter((ib) => isXrayProtocol(ib.protocol) && inboundNode(ctx, ib)?.id === node?.id);
  const psiphonOk = !!node?.isLocal && ctx.psiphon.enabled;
  const tp = node ? tunnelParts(ctx, node, warn) : { ins: [], outs: [], rules: [], bridges: [], portals: [], entryTags: [] as string[] };

  const outbounds: any[] = [
    { tag: "direct", protocol: "freedom", settings: {}, streamSettings: { sockopt: { domainStrategy: ctx.dns.queryStrategy } } },
    { tag: "block", protocol: "blackhole", settings: {} },
  ];
  if (psiphonOk) outbounds.push({ tag: "psiphon", protocol: "socks", settings: { servers: [{ address: "127.0.0.1", port: ctx.psiphon.localSocksPort }] } });
  outbounds.push(...tp.outs);
  const upstream = [...tp.entryTags.filter((x) => x.startsWith("tunnel-") || x.startsWith("portal-")), ...(psiphonOk ? ["psiphon"] : [])];
  const proxyTag = upstream[0] || "direct";
  const balancer = r.random.enabled && upstream.length ? { tag: "auto", selector: upstream, strategy: { type: r.random.strategy } } : null;
  const target = (name: string): any => {
    if (name === "block") return { outboundTag: "block" };
    if (name === "psiphon") return { outboundTag: psiphonOk ? "psiphon" : "direct" };
    if (name === "proxy") return { outboundTag: proxyTag };
    if (name === "random") return balancer ? { balancerTag: "auto" } : { outboundTag: proxyTag };
    if (name.startsWith("tunnel:")) {
      const t = ctx.tunnels.find((x) => x.id === Number(name.slice(7)));
      return t && tp.entryTags.includes(tunnelOutTag(t)) ? { outboundTag: tunnelOutTag(t) } : { outboundTag: proxyTag };
    }
    return { outboundTag: "direct" };
  };

  const rules: any[] = [...tp.rules];
  const add = (match: any, out: string) => {
    for (const k of ["domain", "ip"]) if (match[k]) { match[k] = geoFilter(match[k], warn); if (!match[k].length) return; }
    rules.push({ type: "field", ...match, ...target(out) });
  };
  // 1) security blocks
  add({ ip: ["geoip:private"] }, r.directInternal ? "direct" : "block");
  const bp = lines(ctx.sec.domainsPorts.blockedPorts).join(",");
  if (bp) add({ port: bp }, "block");
  if (r.blockMalware) { add({ domain: ["geosite:malware"] }, "block"); add({ ip: ["geoip:malware"] }, "block"); }
  if (r.blockPhishing) { add({ domain: ["geosite:phishing"] }, "block"); add({ ip: ["geoip:phishing"] }, "block"); }
  if (r.blockMiners) add({ domain: ["geosite:cryptominers"] }, "block");
  if (r.blockAds) add({ domain: ["geosite:category-ads-all"] }, "block");
  if (r.blockTrackers) add({ domain: ["geosite:category-public-tracker", "keyword:tracker", "keyword:announce"] }, "block");
  if (r.blockAdult) add({ domain: ["geosite:category-porn", "geosite:nsfw"] }, "block");
  if (r.blockBittorrent) add({ protocol: ["bittorrent"] }, "block");
  if (r.blockQuic) add({ network: "udp", port: "443" }, "block");
  // 2) custom rules (priority order)
  for (const cr of ctx.rules) {
    const items = lines(cr.match);
    if (!items.length) continue;
    const m: any = {};
    if (cr.ruleType === "domain") m.domain = items;
    else if (cr.ruleType === "geosite") m.domain = items.map((x) => (x.includes(":") ? x : `geosite:${x}`));
    else if (cr.ruleType === "ip") m.ip = items;
    else if (cr.ruleType === "geoip") m.ip = items.map((x) => (x.includes(":") ? x : `geoip:${x}`));
    else if (cr.ruleType === "port") m.port = items.join(",");
    else if (cr.ruleType === "protocol") m.protocol = items;
    else if (cr.ruleType === "inbound") m.inboundTag = items;
    else continue;
    add(m, cr.outbound);
  }
  // 3) direct presets
  if (r.bypassSanctions) add({ domain: ["geosite:sanctioned"] }, r.sanctionsOutbound);
  if (r.directIran) { add({ domain: ["geosite:ir", "regexp:\\.ir$"] }, "direct"); add({ ip: ["geoip:ir"] }, "direct"); }
  if (r.directChina) { add({ domain: ["geosite:cn"] }, "direct"); add({ ip: ["geoip:cn"] }, "direct"); }
  if (r.directRussia) { add({ domain: ["geosite:category-ru"] }, "direct"); add({ ip: ["geoip:ru"] }, "direct"); }
  // 4) inbound → tunnel / psiphon chains
  for (const ib of myInbounds) {
    if (ib.tunnelId) {
      const t = ctx.tunnels.find((x) => x.id === ib.tunnelId);
      if (t && t.enabled && tp.entryTags.includes(tunnelOutTag(t))) rules.push({ type: "field", inboundTag: [`in-${ib.id}`], outboundTag: tunnelOutTag(t) });
      else warn.push(`inbound "${ib.name}": tunnel #${ib.tunnelId} disabled/invalid — using normal routing`);
    } else if (ib.protocol === "psiphon") {
      if (psiphonOk) rules.push({ type: "field", inboundTag: [`in-${ib.id}`], outboundTag: "psiphon" });
      else warn.push(`inbound "${ib.name}": Psiphon is disabled in settings`);
    }
  }
  // 5) default
  const def = balancer ? { balancerTag: "auto" } : target(r.defaultOutbound);
  rules.push({ type: "field", network: "tcp,udp", ...def });

  const cfg: any = {
    log: { loglevel: "warning", access: "none" },
    api: { tag: "api", listen: XRAY_API, services: ["StatsService", "HandlerService"] },
    stats: {},
    policy: { levels: { "0": { statsUserUplink: true, statsUserDownlink: true, handshake: 4, connIdle: 300 } }, system: { statsInboundUplink: true, statsInboundDownlink: true, statsOutboundUplink: true, statsOutboundDownlink: true } },
    dns: buildDns(ctx, warn),
    inbounds: [...myInbounds.map((ib) => xrayInbound(ctx, ib)), ...tp.ins],
    outbounds,
    routing: { domainStrategy: r.domainStrategy, rules, ...(balancer ? { balancers: [balancer] } : {}) },
  };
  if (ctx.dns.fakeDns.enabled) cfg.fakedns = [{ ipPool: ctx.dns.fakeDns.pool, poolSize: ctx.dns.fakeDns.poolSize }];
  if (balancer && r.random.strategy === "leastPing") cfg.observatory = { subjectSelector: upstream, probeUrl: "https://www.gstatic.com/generate_204", probeInterval: "1m" };
  if (balancer && r.random.strategy === "leastLoad") cfg.burstObservatory = { subjectSelector: upstream, pingConfig: { destination: "https://www.gstatic.com/generate_204", interval: "1m" } };
  return JSON.stringify(cfg, null, 2);
}

// ---------------------------------------------------------------- other cores (local node only)
const localOnly = (ctx: Ctx, proto: string) => ctx.inbounds.filter((ib) => ib.protocol === proto && inboundNode(ctx, ib)?.isLocal);

export function hysteriaYaml(ctx: Ctx, warn: string[] = []): string | null {
  const list = localOnly(ctx, "hysteria2");
  if (!list.length) return null;
  if (list.length > 1) warn.push(`Hysteria2: only one inbound per server — using "${list[0].name}"`);
  const ib = list[0];
  const q = (s: string) => JSON.stringify(String(s));
  const users = ctx.activeUsers.filter((u) => userAllowed(ctx, u, "hysteria2"));
  const up = users.length ? users.map((u) => `    ${q(u.username)}: ${q(u.vpnPassword)}`).join("\n") : `    "__none__": ${q(internalKey())}`;
  const obfs = ib.obfs || ctx.obf.hysteriaObfsPassword;
  const tls = ctx.sec.tls;
  return [
    `# Generated by VVSM — inbound "${ib.name}"`,
    `listen: :${ib.port}`,
    `tls:\n  cert: ${ib.certPath || tls.certPath}\n  key: ${ib.keyPath || tls.keyPath}`,
    `auth:\n  type: userpass\n  userpass:\n${up}`,
    obfs ? `obfs:\n  type: salamander\n  salamander:\n    password: ${q(obfs)}` : "",
    ib.upMbps || ib.downMbps ? `bandwidth:\n  up: ${ib.upMbps || 1000} mbps\n  down: ${ib.downMbps || 1000} mbps` : "",
    `ignoreClientBandwidth: false`,
    `masquerade:\n  type: proxy\n  proxy:\n    url: ${ctx.hidden.decoyUrl || "https://www.wikipedia.org"}\n    rewriteHost: true`,
    `trafficStats:\n  listen: ${HY_STATS}\n  secret: ${internalKey()}`,
  ].filter(Boolean).join("\n") + "\n";
}

/** AmneziaWG obfuscation lines ([Interface]); empty in "standard" mode (plain WireGuard on the wire). */
export function awgLines(w: { mode: string; jc: number; jmin: number; jmax: number; s1: number; s2: number; h1: number; h2: number; h3: number; h4: number }): string {
  if (w.mode !== "amnezia" || !w.h1) return "";
  return `Jc = ${w.jc}\nJmin = ${w.jmin}\nJmax = ${w.jmax}\nS1 = ${w.s1}\nS2 = ${w.s2}\nH1 = ${w.h1}\nH2 = ${w.h2}\nH3 = ${w.h3}\nH4 = ${w.h4}\n`;
}

export function wgConf(ctx: Ctx, warn: string[] = []): { conf: string; limits: string } | null {
  const list = localOnly(ctx, "wireguard");
  if (!list.length) return null;
  if (list.length > 1) warn.push(`WireGuard: only interface wg0 is managed — using "${list[0].name}"`);
  const ib = list[0];
  const users = ctx.activeUsers.filter((u) => u.wgPublicKey && u.wgIp && userAllowed(ctx, u, "wireguard"));
  const peers = users.map((u) => `\n# ${u.username}\n[Peer]\nPublicKey = ${u.wgPublicKey}\nAllowedIPs = ${u.wgIp}/32`).join("\n");
  const conf = `# Generated by VVSM — AmneziaWG (userspace) — mode: ${ctx.wg.mode}\n[Interface]\nAddress = ${ctx.wg.interfaceAddress}\nListenPort = ${ib.port}\nPrivateKey = ${ib.privateKey}\nMTU = ${ctx.wg.mtu}\n${awgLines(ctx.wg)}${peers}\n`;
  const shaped = users.filter((u) => u.speedLimitMbps > 0);
  const limits = ["#!/bin/bash", "# Generated by VVSM — per-user download shaping on wg0", "IF=awg0", "ip link show $IF >/dev/null 2>&1 || exit 0", "tc qdisc del dev $IF root 2>/dev/null", "tc qdisc add dev $IF root handle 1: htb default ffff", "tc class add dev $IF parent 1: classid 1:ffff htb rate 10gbit",
    ...shaped.map((u, i) => `tc class add dev $IF parent 1: classid 1:${(i + 10).toString(16)} htb rate ${u.speedLimitMbps}mbit ceil ${u.speedLimitMbps}mbit\ntc filter add dev $IF protocol ip parent 1: prio 1 u32 match ip dst ${u.wgIp}/32 flowid 1:${(i + 10).toString(16)}`)].join("\n") + "\n";
  return { conf, limits };
}

export function ovpnConf(ctx: Ctx, warn: string[] = []): string | null {
  const list = localOnly(ctx, "openvpn");
  if (!list.length) return null;
  if (list.length > 1) warn.push(`OpenVPN: one server instance — using "${list[0].name}"`);
  const ib = list[0];
  const proto = ib.transport === "tcp" ? "tcp" : "udp";
  const dns = lines(ctx.wg.clientDns).map((d) => `push "dhcp-option DNS ${d}"`).join("\n");
  return `# Generated by VVSM
port ${ib.port}
proto ${proto}
dev tun
ca /etc/vvsm/openvpn/ca.crt
cert /etc/vvsm/openvpn/server.crt
key /etc/vvsm/openvpn/server.key
dh none
tls-crypt /etc/vvsm/openvpn/tc.key
topology subnet
server 10.77.0.0 255.255.0.0
push "redirect-gateway def1 bypass-dhcp"
${dns}
keepalive 10 60
data-ciphers AES-256-GCM:AES-128-GCM:CHACHA20-POLY1305
auth SHA256
tls-version-min 1.2
persist-tun
status /var/log/openvpn/vvsm-status.log 10
status-version 2
verb 3
script-security 2
auth-user-pass-verify /opt/vvsm/scripts/ovpn-auth.sh via-file
tmp-dir /tmp
verify-client-cert none
username-as-common-name
duplicate-cn
${proto === "udp" ? "explicit-exit-notify 1\n" : ""}`;
}

export function psiphonJson(ctx: Ctx): string {
  const p = ctx.psiphon;
  const cfg: any = {
    LocalSocksProxyPort: p.localSocksPort, LocalHttpProxyPort: p.localHttpPort,
    PropagationChannelId: p.propagationChannelId, SponsorId: p.sponsorId,
    DataRootDirectory: "/var/lib/vvsm/psiphon", EmitDiagnosticNotices: true,
  };
  // NOTE: "RemoteServerListURLs" expects base64-encoded URLs — the plain legacy field is used instead (verified working)
  if (p.remoteServerListUrl) { cfg.RemoteServerListUrl = p.remoteServerListUrl; cfg.RemoteServerListSignaturePublicKey = p.remoteServerListSignaturePublicKey; cfg.RemoteServerListDownloadFilename = "remote_server_list"; }
  cfg.UseIndistinguishableTLS = true;
  if (p.targetServerEntry) cfg.TargetServerEntry = p.targetServerEntry;
  if (p.region) cfg.EgressRegion = p.region.toUpperCase();
  return JSON.stringify(cfg, null, 2);
}

export function nginxRoutes(ctx: Ctx, warn: string[] = []): string {
  const out = ["# Generated by VVSM panel — hidden routing paths (do not edit)"];
  const hiddenIbs = ctx.inbounds.filter((ib) => ib.hidden && isXrayProtocol(ib.protocol) && HTTP_TRANSPORTS.includes(ib.transport) && inboundNode(ctx, ib)?.isLocal);
  if (!ctx.hidden.enabled) {
    if (hiddenIbs.length) warn.push(`${hiddenIbs.length} hidden inbound(s) unreachable: hidden routes are disabled`);
    return out.join("\n") + "\n";
  }
  const seen = new Set<string>();
  for (const ib of hiddenIbs) {
    const p = ib.transport === "grpc" ? `/${ib.serviceName || ib.path.replace(/^\//, "")}` : ib.path.startsWith("/") ? ib.path : `/${ib.path}`;
    if (p === "/" || !/^\/[A-Za-z0-9._~\-\/]+$/.test(p) || seen.has(p) || /^\/(api|admin|_next|sub|s|portal|blog|buy|pay|apps)(\/|$)/.test(p)) { warn.push(`inbound "${ib.name}": path "${p}" invalid or duplicated — use "Randomize path"`); continue; }
    if (!Number.isInteger(ib.port) || ib.port < 1 || ib.port > 65535) { warn.push(`inbound "${ib.name}": invalid port`); continue; }
    seen.add(p);
    if (ib.transport === "grpc" || ib.transport === "xhttp")
      out.push(`location ${p} {\n  grpc_pass grpc://127.0.0.1:${ib.port};\n  grpc_read_timeout 1h;\n  grpc_send_timeout 1h;\n  grpc_set_header X-Real-IP $remote_addr;\n  client_max_body_size 0;\n  client_body_timeout 1h;\n}`);
    else
      out.push(`location ${p} {\n  proxy_pass http://127.0.0.1:${ib.port};\n  proxy_http_version 1.1;\n  proxy_set_header Upgrade $http_upgrade;\n  proxy_set_header Connection "upgrade";\n  proxy_set_header Host $host;\n  proxy_set_header X-Real-IP $remote_addr;\n  proxy_read_timeout 1d;\n  proxy_buffering off;\n}`);
  }
  return out.join("\n") + "\n";
}

export async function previewConfig(core: string, nodeId: number | null = null): Promise<string> {
  const ctx = await loadCtx();
  const warn: string[] = [];
  let text = "";
  if (core === "xray") text = await buildXrayConfig(nodeId, ctx, warn);
  else if (core === "hysteria2" || core === "hysteria") text = hysteriaYaml(ctx, warn) || "# no enabled Hysteria2 inbound on the main server";
  else if (core === "wireguard" || core === "wg") { const w = wgConf(ctx, warn); text = w ? `${w.conf}\n# ---- ${CONF.wgLimits} ----\n${w.limits}` : "# no enabled WireGuard inbound on the main server"; }
  else if (core === "openvpn") text = ovpnConf(ctx, warn) || "# no enabled OpenVPN inbound on the main server";
  else if (core === "psiphon") text = psiphonJson(ctx);
  else if (core === "nginx") text = nginxRoutes(ctx, warn);
  else return `unknown core: ${core}`;
  const c = core === "xray" || core === "psiphon" ? "//" : "#";
  return warn.length ? `${c} WARNINGS:\n${warn.map((w) => `${c}  - ${w}`).join("\n")}\n${core === "xray" || core === "psiphon" ? "" : ""}${text}` : text;
}

// ---------------------------------------------------------------- validation
export function validateCtx(ctx: Ctx): string[] {
  const issues: string[] = [];
  const byNode = new Map<string, string>();
  for (const ib of ctx.inbounds) {
    const n = inboundNode(ctx, ib);
    if (!n) { issues.push(`inbound "${ib.name}": node not found`); continue; }
    if (!n.isLocal && !isXrayProtocol(ib.protocol)) issues.push(`inbound "${ib.name}": ${ib.protocol} is only served on the main server (remote nodes run Xray only)`);
    if (ib.tunnelId && ib.nodeId && ib.nodeId !== n.id) issues.push(`inbound "${ib.name}": moved to tunnel entry node "${n.name}"`);
    const udp = ["hysteria2", "wireguard"].includes(ib.protocol) || (ib.protocol === "openvpn" && ib.transport !== "tcp");
    const key = `${n.id}:${udp ? "udp" : "tcp"}:${ib.hidden ? "127.0.0.1" : "*"}:${ib.port}`;
    if (byNode.has(key)) issues.push(`port ${ib.port}/${udp ? "udp" : "tcp"} on "${n.name}" used by "${byNode.get(key)}" and "${ib.name}"`);
    byNode.set(key, ib.name);
    if (!udp && !ib.hidden && n.isLocal && [80, 443].includes(ib.port)) issues.push(`inbound "${ib.name}": port ${ib.port} is used by Nginx — use a hidden route or another port`);
    if (["vless", "trojan", "psiphon"].includes(ib.protocol) && ib.security === "none" && !ib.hidden) issues.push(`inbound "${ib.name}": ${ib.protocol} without TLS/REALITY is refused by Xray 26 clients — edit it and choose tls or reality`);
    if (ib.useCleanIp && !ctx.cleanip.auto) issues.push(`inbound "${ib.name}": clean IPs are off (Tools → Settings → use clean IPs)`);
    if (ib.useCleanIp && ctx.cleanip.auto && !ctx.cleanIps.length) issues.push(`inbound "${ib.name}": clean-IP list is empty — run the scanner in Tools`);
    if (ib.security === "reality" && (!ib.privateKey || !ib.publicKey)) issues.push(`inbound "${ib.name}": REALITY keys missing (use "Regenerate keys")`);
  }
  for (const t of ctx.tunnels.filter((x) => x.enabled)) {
    const e = tunnelEntry(ctx, t), x = tunnelExit(ctx, t);
    if (e && x && e.id !== x.id && !nodeHost(ctx, t.mode === "reverse" ? e : x)) issues.push(`tunnel "${t.name}": ${t.mode === "reverse" ? "entry" : "exit"} node has no IP/domain`);
    const l = tunnelListener(ctx, t);
    if (l?.node && usedPorts(ctx, l.node.id, l.proto, t.id).has(t.listenPort)) issues.push(`tunnel "${t.name}": port ${t.listenPort}/${l.proto} already used on "${l.node.name}"`);
  }
  return issues;
}

// ---------------------------------------------------------------- apply
type ApplyState = { pending: boolean; pendingSince: number | null; running: boolean; lastAppliedAt: number | null; lastStatus: "ok" | "warn" | "error" | null; lastSteps: Step[]; lastDurationMs: number; timer?: ReturnType<typeof setTimeout>; promise?: Promise<Step[]> };
const g = globalThis as any;
const state: ApplyState = (g.__vvsmApplyState ??= { pending: false, pendingSince: null, running: false, lastAppliedAt: null, lastStatus: null, lastSteps: [], lastDurationMs: 0 });

export function applyState() {
  const { timer: _t, promise: _p, ...rest } = state;
  void _t; void _p;
  return rest;
}

type CoreOpts = { test?: (tmp: string) => Promise<{ ok: boolean; out: string }>; testLive?: () => Promise<{ ok: boolean; out: string }>; reload?: () => Promise<{ ok: boolean; out: string }>; mode?: number };

/** Temp file next to the target that keeps the extension (Xray detects the format from it: config.vvsm-new.json). */
const tmpName = (file: string) => {
  const ext = path.extname(file);
  // outside the core's directory (some Xray setups load every file in a confdir), extension kept for format detection
  return path.join(os.tmpdir(), `vvsm-${path.basename(file, ext)}-${process.pid}${ext}`);
};

async function writeCore(name: string, file: string, content: string, opts: CoreOpts = {}): Promise<Step> {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir) || process.env.E2B_SANDBOX === "true") {
    await fsp.mkdir(GENERATED, { recursive: true });
    const gen = path.join(GENERATED, path.basename(file));
    await fsp.writeFile(gen, content, { mode: opts.mode ?? 0o600 });
    return { name, status: "skipped", detail: M("apply.notInstalled", { file: path.relative(process.cwd(), gen) }) };
  }
  const old = await fsp.readFile(file, "utf8").catch(() => null);
  if (old === content) {
    // config unchanged — still make sure the live file is valid (repairs a previously broken state)
    if (opts.testLive) {
      const t = await opts.testLive();
      if (!t.ok) return { name, status: "error", detail: `live config invalid: ${t.out.slice(-500)}` };
    }
    return { name, status: "info", detail: M("apply.unchanged") };
  }
  const tmp = tmpName(file);
  await fsp.writeFile(tmp, content, { mode: opts.mode ?? 0o600 });
  if (opts.test) {
    const r = await opts.test(tmp);
    if (!r.ok) {
      await fsp.rm(tmp, { force: true });
      return { name, status: "error", detail: `${M("apply.validationFailed")} ${r.out.slice(-600)}` };
    }
  }
  await fsp.writeFile(file, content, { mode: opts.mode ?? 0o600 });
  await fsp.rm(tmp, { force: true });
  const restore = async (why: string) => {
    if (old === null) await fsp.rm(file, { force: true }); else await fsp.writeFile(file, old, { mode: opts.mode ?? 0o600 });
    if (opts.reload) await opts.reload().catch(() => null);
    return { name, status: "error" as const, detail: `${M("apply.restored")} ${why}` };
  };
  if (opts.testLive) {
    const t = await opts.testLive();
    if (!t.ok) {
      const line = /:(\d+)\s*$/m.exec(t.out.split("\n").find((l) => l.includes(file)) || "")?.[1];
      const bad = line ? content.split("\n")[Number(line) - 1]?.trim() : "";
      return restore(`validation failed: ${t.out.slice(-400)}${bad ? ` | line ${line}: ${bad}` : ""}`);
    }
  }
  if (opts.reload) {
    const r = await opts.reload();
    if (!r.ok) return restore(`reload failed: ${r.out.slice(-400)}`);
  }
  return { name, status: "applied", detail: M("apply.updated") };
}

const restart = (unit: string) => async () => {
  const r = await run("systemctl", ["restart", unit], 30000);
  if (!r.ok) return r;
  const a = await run("systemctl", ["is-active", unit], 4000);
  return { ok: a.ok, out: a.ok ? "active" : `${unit}: ${a.out}` };
};

async function doApply(): Promise<Step[]> {
  const started = Date.now();
  const steps: Step[] = [];
  const ctx = await loadCtx();
  const issues = validateCtx(ctx);
  steps.push({ name: "validate", status: issues.length ? "info" : "applied", detail: issues.length ? issues.join(" · ") : `${ctx.inbounds.length} inbounds · ${ctx.tunnels.filter((t) => t.enabled).length} tunnels · ${ctx.activeUsers.length} active users` });

  const xw: string[] = [];
  const xray = await buildXrayConfig(ctx.local?.id ?? null, ctx, xw);
  const xs = await writeCore("xray", CONF.xray, xray, { test: (tmp) => run("xray", ["run", "-test", "-format", "json", "-config", tmp], 20000), reload: restart("xray"), mode: 0o644 });
  if (xw.length) xs.detail = `${xs.detail} · ${xw.length} warning(s): ${xw.slice(0, 4).join(" · ")}`;
  steps.push(xs);

  const hw: string[] = [];
  const hy = hysteriaYaml(ctx, hw);
  steps.push(hy ? await writeCore("hysteria2", CONF.hysteria, hy, { reload: restart("hysteria-server"), mode: 0o644 }) : { name: "hysteria2", status: "skipped", detail: M("apply.noInbound", { p: "Hysteria2" }) });

  const wg = wgConf(ctx);
  if (wg) {
    const s = await writeCore("wireguard", CONF.wg, wg.conf, {
      reload: async () => {
        // retire the old kernel wg0 (frees the UDP port) — WireGuard now runs on the AmneziaWG userspace engine
        await run("bash", ["-c", "systemctl is-enabled --quiet wg-quick@wg0 2>/dev/null && systemctl disable --now wg-quick@wg0; true"], 15000);
        const up = await run("ip", ["link", "show", "awg0"], 3000);
        const r = up.ok ? await run("bash", ["-c", "awg syncconf awg0 <(awg-quick strip awg0)"], 15000) : await (async () => { await run("systemctl", ["enable", "awg-quick@awg0"], 8000); return restart("awg-quick@awg0")(); })();
        await run("systemctl", ["restart", "vvsm-nat"], 10000);
        return r;
      },
    });
    steps.push(s);
    if (s.status !== "skipped") {
      await fsp.writeFile(CONF.wgLimits, wg.limits, { mode: 0o755 }).catch(() => {});
      await run("bash", [CONF.wgLimits], 15000);
    }
  } else steps.push({ name: "wireguard", status: "skipped", detail: M("apply.noInbound", { p: "WireGuard" }) });

  const ov = ovpnConf(ctx);
  steps.push(ov ? await writeCore("openvpn", CONF.ovpn, ov, { reload: restart("openvpn-server@vvsm"), mode: 0o644 }) : { name: "openvpn", status: "skipped", detail: M("apply.noInbound", { p: "OpenVPN" }) });

  if (ctx.psiphon.enabled) {
    const missing = !ctx.psiphon.propagationChannelId || !ctx.psiphon.sponsorId;
    steps.push(missing ? { name: "psiphon", status: "error", detail: "Propagation Channel ID and Sponsor ID are required" } : await writeCore("psiphon", CONF.psiphon, psiphonJson(ctx), { reload: restart("vvsm-psiphon") }));
  } else steps.push({ name: "psiphon", status: "skipped", detail: M("apply.psiphonOff") });

  const nw: string[] = [];
  const ng = await writeCore("nginx", CONF.nginx, nginxRoutes(ctx, nw), { mode: 0o644, testLive: () => run("nginx", ["-t"], 8000), reload: () => run("systemctl", ["reload", "nginx"], 10000) });
  if (nw.length) ng.detail = `${ng.detail} · ${nw.join(" · ")}`;
  steps.push(ng);

  // port hopping for Hysteria2
  if (hy && ctx.obf.portHopping.enabled && fs.existsSync("/etc/hysteria")) {
    const ib = localOnly(ctx, "hysteria2")[0];
    const range = ctx.obf.portHopping.hopRange.replace("-", ":");
    const r = await run("bash", ["-c", `iptables -t nat -N VVSM_HOP 2>/dev/null; iptables -t nat -F VVSM_HOP; iptables -t nat -C PREROUTING -j VVSM_HOP 2>/dev/null || iptables -t nat -A PREROUTING -j VVSM_HOP; iptables -t nat -A VVSM_HOP -p udp --dport ${range} -j REDIRECT --to-ports ${ib.port}`], 8000);
    steps.push({ name: "port-hopping", status: r.ok ? "applied" : "error", detail: r.ok ? `UDP ${ctx.obf.portHopping.hopRange} → ${ib.port}` : r.out });
  }

  // remote nodes pull their config through the agent
  const remote = ctx.nodes.filter((n) => !n.isLocal && n.enabled);
  if (remote.length) {
    let synced = 0;
    const lagging: string[] = [];
    for (const n of remote) {
      const h = sha256(await buildXrayConfig(n.id, ctx));
      if (n.agentConfigHash === h) synced++; else lagging.push(n.name);
    }
    steps.push({ name: "nodes", status: "info", detail: M(lagging.length ? "apply.nodesLag" : "apply.nodesOk", { n: synced, total: remote.length, list: lagging.slice(0, 5).join(", ") }) });
  }
  const fw = await applyFirewall(ctx);
  if (fw) steps.push(fw);
  const lt = await applyLocalTunnels(ctx);
  if (lt) steps.push(lt);
  await refreshTunnelStatuses(ctx).catch(() => {});
  const errs = steps.filter((s) => s.status === "error").length;
  state.lastStatus = errs ? "error" : issues.length ? "warn" : "ok";
  state.lastAppliedAt = Date.now();
  state.lastSteps = steps;
  state.lastDurationMs = Date.now() - started;
  await logEvent(errs ? "warn" : "info", "cores", `apply finished in ${state.lastDurationMs} ms: ${steps.map((s) => `${s.name}=${s.status}`).join(", ")}`);
  return steps;
}

/** Generate, validate and apply every core. Concurrent calls share one run. */
export async function applyCores(): Promise<Step[]> {
  if (state.timer) { clearTimeout(state.timer); state.timer = undefined; }
  if (state.promise) {
    // a run is in progress: wait, then run again so the newest change is included
    await state.promise.catch(() => {});
  }
  state.running = true;
  state.pending = false;
  state.pendingSince = null;
  state.promise = doApply().finally(() => { state.running = false; state.promise = undefined; });
  try {
    return await state.promise;
  } catch (e) {
    state.lastStatus = "error";
    const steps: Step[] = [{ name: "apply", status: "error", detail: e instanceof Error ? e.message : String(e) }];
    state.lastSteps = steps;
    return steps;
  }
}

/** Mark the configuration dirty; auto-apply after a debounce when enabled (Security → Updates → auto apply). */
export function scheduleApply(delayMs = 2500) {
  state.pending = true;
  state.pendingSince ??= Date.now();
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(async () => {
    state.timer = undefined;
    try {
      const u = await getSettings("updates");
      if (u.autoApply) await applyCores();
    } catch (e) {
      console.error("[vvsm] auto-apply failed", e);
    }
  }, delayMs);
}

// ---------------------------------------------------------------- tunnel ports
type TunnelDraft = { id?: number; carrier: string; mode: string; transport?: string; entryNodeId: number | null; exitNodeId: number | null; listenPort: number; enabled?: boolean };

/** Which node opens the tunnel's listening port, and on which L4 protocol. */
export function tunnelListener(ctx: Ctx, t: TunnelDraft): { node: Node | undefined; proto: "tcp" | "udp" } | null {
  if (t.carrier === "psiphon") return null;
  const entry = nodeById(ctx, t.entryNodeId), exit = nodeById(ctx, t.exitNodeId);
  if (isXrayCarrier(t.carrier)) return { node: t.mode === "reverse" ? entry : exit, proto: "tcp" };
  const reverseL3 = t.mode === "reverse" && ["wireguard", "openvpn"].includes(t.carrier);
  return { node: reverseL3 ? entry : exit, proto: t.carrier === "openvpn" && t.transport === "tcp" ? "tcp" : "udp" };
}

function usedPorts(ctx: Ctx, nodeId: number | undefined, proto: "tcp" | "udp", excludeTunnel?: number): Set<number> {
  const used = new Set<number>();
  const node = ctx.nodes.find((n) => n.id === nodeId);
  if (!node) return used;
  if (node.isLocal && proto === "tcp") [22, 80, 443, Number(process.env.PORT || 3000), 10085].forEach((p) => used.add(p));
  if (node.isLocal && proto === "udp") [25413].forEach((p) => used.add(p));
  for (const ib of ctx.inbounds) {
    if (inboundNode(ctx, ib)?.id !== node.id || ib.hidden) continue;
    const udp = ["hysteria2", "wireguard"].includes(ib.protocol) || (ib.protocol === "openvpn" && ib.transport !== "tcp");
    if ((udp ? "udp" : "tcp") === proto) used.add(ib.port);
  }
  for (const t of ctx.tunnels) {
    if (t.id === excludeTunnel || !t.enabled) continue;
    const l = tunnelListener(ctx, t);
    if (l && l.node?.id === node.id && l.proto === proto) used.add(t.listenPort);
  }
  return used;
}

/** Returns the requested port if free on the listening node, otherwise the next free one (prevents "only one tunnel works"). */
export async function pickTunnelPort(t: TunnelDraft): Promise<number> {
  const ctx = await loadCtx();
  const l = tunnelListener(ctx, t);
  if (!l?.node) return t.listenPort;
  const used = usedPorts(ctx, l.node.id, l.proto, t.id);
  let p = Number(t.listenPort) || 4443;
  while (used.has(p) && p < 65000) p++;
  return p;
}

/** Ports a remote node must accept (sent to the agent to open ufw). */
export function nodePorts(ctx: Ctx, nodeId: number): string[] {
  const out = new Set<string>();
  for (const ib of ctx.inbounds) if (inboundNode(ctx, ib)?.id === nodeId && isXrayProtocol(ib.protocol) && !ib.hidden) out.add(`${ib.port}/tcp`);
  for (const t of ctx.tunnels.filter((x) => x.enabled)) {
    const l = tunnelListener(ctx, t);
    if (l?.node?.id === nodeId) out.add(`${t.listenPort}/${l.proto}`);
  }
  return [...out];
}

// ---------------------------------------------------------------- tunnel health
const g2 = globalThis as any;
async function localUnits(units: string[]): Promise<Record<string, boolean | null>> {
  const out: Record<string, boolean | null> = {};
  if (!units.length) return out;
  const r = await run("systemctl", ["is-active", ...units], 5000);
  const rows = r.out.split("\n").map((x) => x.trim());
  const noSystemd = /Failed to connect|ENOENT|not been booted|System has not/i.test(r.out);
  units.forEach((u, i) => (out[u] = noSystemd ? null : rows[i] === "active"));
  return out;
}

export async function refreshTunnelStatuses(ctxIn?: Ctx) {
  if (g2.__vvsmTunRefresh && Date.now() - g2.__vvsmTunRefresh < 3000) return;
  g2.__vvsmTunRefresh = Date.now();
  const ctx = ctxIn || (await loadCtx());
  const now = Date.now();
  const fresh = (d: Date | null, ms: number) => !!d && now - new Date(d).getTime() < ms;
  const hashes = new Map<number, string>();
  const expectedHash = async (n: Node) => {
    if (!hashes.has(n.id)) hashes.set(n.id, sha256(await buildXrayConfig(n.id, ctx)));
    return hashes.get(n.id)!;
  };
  const units = new Set<string>(["xray"]);
  for (const t of ctx.tunnels) { units.add(`vvsm-tun-${t.id}`); units.add(`awg-quick@vvsmt${t.id}`); }
  const local = await localUnits([...units]);
  /** health of the Xray side on a node: [ok, reason] */
  const xraySide = async (n: Node): Promise<[boolean, string]> => {
    if (n.isLocal) return local.xray === false ? [false, M("side.xrayLocalDown")] : [true, ""];
    if (!n.enabled) return [false, M("side.nodeDisabled", { node: n.name })];
    if (!n.lastSeenAt) return [false, M("side.agentMissing", { node: n.name })];
    if (!fresh(n.lastSeenAt, 120000)) return [false, M("side.agentSilent", { node: n.name, since: new Date(n.lastSeenAt).toISOString().slice(0, 16).replace("T", " ") })];
    if (n.agentError) return [false, M("side.agentError", { node: n.name, err: n.agentError.slice(0, 160) })];
    if (!n.xrayActive) return [false, M("side.xrayDown", { node: n.name })];
    if (n.agentConfigHash !== (await expectedHash(n))) return [false, M("side.notSynced", { node: n.name })];
    return [true, ""];
  };
  /** health of a non-Xray transport side */
  const unitSide = (n: Node, unit: string, seen: Date | null, side: "entry" | "exit"): [boolean, string] => {
    if (n.isLocal) {
      const st = local[unit];
      if (st === null || st === undefined) return fresh(seen, 180000) ? [true, ""] : [false, M(`side.${side}.localPending`)];
      return st ? [true, ""] : [false, M(`side.${side}.localDown`, { unit })];
    }
    if (!seen) return [false, M(`side.${side}.notInstalled`, { node: n.name })];
    return fresh(seen, 180000) ? [true, ""] : [false, M(`side.${side}.silent`, { node: n.name })];
  };
  const ports = new Map<string, number>();
  for (const t of ctx.tunnels.filter((x) => x.enabled)) {
    const l = tunnelListener(ctx, t);
    if (l?.node) { const k = `${l.node.id}:${l.proto}:${t.listenPort}`; ports.set(k, (ports.get(k) || 0) + 1); }
  }
  for (const t of ctx.tunnels) {
    const e = tunnelEntry(ctx, t), x = tunnelExit(ctx, t);
    let status = "pending", detail = "", eo = false, xo = false;
    if (!t.enabled) { status = "disabled"; detail = M("tun.disabled"); }
    else if (!e || (!x && t.carrier !== "psiphon")) { status = "error"; detail = M("tun.noNode"); }
    else if (x && e.id === x.id && t.carrier !== "psiphon") { status = "error"; detail = M("tun.sameNode"); }
    else {
      const l = tunnelListener(ctx, t);
      const clash = l?.node && (ports.get(`${l.node.id}:${l.proto}:${t.listenPort}`) || 0) > 1;
      if (clash) { status = "error"; detail = M("tun.portClash", { port: t.listenPort, proto: l!.proto, node: l!.node!.name }); }
      else {
        let er: [boolean, string], xr: [boolean, string];
        if (isXrayCarrier(t.carrier)) { er = await xraySide(e); xr = await xraySide(x!); }
        else if (t.carrier === "wireguard") { er = unitSide(e, `awg-quick@vvsmt${t.id}`, t.entrySeenAt, "entry"); xr = unitSide(x!, `awg-quick@vvsmt${t.id}`, t.exitSeenAt, "exit"); }
        else if (t.carrier === "psiphon") { er = unitSide(e, `vvsm-tun-${t.id}`, t.entrySeenAt, "entry"); xr = [true, ""]; }
        else { er = unitSide(e, `vvsm-tun-${t.id}`, t.entrySeenAt, "entry"); xr = unitSide(x!, `vvsm-tun-${t.id}`, t.exitSeenAt, "exit"); }
        eo = er[0]; xo = xr[0];
        const linkTested = !isXrayCarrier(t.carrier);
        if (eo && xo && linkTested && t.latencyMs === 0 && fresh(t.entrySeenAt, 180000)) { status = "degraded"; detail = M("tun.e2eFail"); }
        else if (eo && xo) { status = "active"; detail = t.latencyMs > 0 ? M("tun.okMs", { ms: t.latencyMs }) : M("tun.ok"); }
        else { status = eo || xo ? "degraded" : t.entrySeenAt || t.exitSeenAt || (!e.isLocal && e.lastSeenAt) || (x && !x.isLocal && x.lastSeenAt) ? "offline" : "pending"; detail = [er[1], xr[1]].filter(Boolean).join(" · "); }
      }
    }
    if (status !== t.status || detail !== t.statusDetail || eo !== t.entryOk || xo !== t.exitOk)
      await db.update(tunnels).set({ status, statusDetail: detail.slice(0, 500), entryOk: eo, exitOk: xo }).where(eq(tunnels.id, t.id));
  }
}

// ---------------------------------------------------------------- tunnel sides on the main server
/**
 * Installs/updates the tunnel sides that live on the MAIN server (no manual command needed) and removes
 * services of tunnels that were deleted/disabled. Remote sides still use the install commands.
 */
async function applyLocalTunnels(ctx: Ctx): Promise<Step | null> {
  if (!ctx.local || process.env.E2B_SANDBOX === "true" || !fs.existsSync("/etc/systemd/system")) return null;
  const { buildTunnelInstallScript, tunnelSideNeedsInstall, tunnelInstallKey } = await import("@/lib/tunnel-install");
  const panel = `http://127.0.0.1:${process.env.PORT || 3000}`;
  const want = new Set<string>();
  const done: string[] = [], failed: string[] = [];
  const stateDir = "/var/lib/vvsm";
  await fsp.mkdir(stateDir, { recursive: true }).catch(() => {});
  for (const t of ctx.tunnels.filter((x) => x.enabled && !isXrayCarrier(x.carrier))) {
    const e = tunnelEntry(ctx, t), x = tunnelExit(ctx, t);
    for (const side of ["entry", "exit"] as const) {
      const n = side === "entry" ? e : x;
      if (!n?.isLocal || !tunnelSideNeedsInstall(t, side)) continue;
      if (e && x && e.id === x.id) continue;
      want.add(String(t.id));
      const script = buildTunnelInstallScript({ t, side, entryNode: e, exitNode: x, panel, key: tunnelInstallKey(t.id, side), wgMtu: ctx.wg.mtu, psiphonConfig: psiphonJson(ctx), publicHost: nodeHost(ctx, ctx.local) });
      const hashFile = path.join(stateDir, `tun-${t.id}-${side}.hash`);
      const h = sha256(script);
      if ((await fsp.readFile(hashFile, "utf8").catch(() => "")) === h) continue;
      const r = await run("bash", ["-c", script], 300000);
      if (r.ok) { await fsp.writeFile(hashFile, h); done.push(`#${t.id} ${side}`); }
      else failed.push(`#${t.id} ${side}: ${r.out.slice(-200)}`);
    }
  }
  // cleanup of removed tunnels
  const removed: string[] = [];
  const units = (await fsp.readdir("/etc/systemd/system").catch(() => [] as string[])).filter((f) => /^vvsm-tun-\d+(-report)?\.service$/.test(f));
  const wgs = (await fsp.readdir("/etc/amnezia/amneziawg").catch(() => [] as string[])).filter((f) => /^vvsmt\d+\.conf$/.test(f));
  for (const f of [...units, ...wgs]) {
    const id = /(\d+)/.exec(f)![1];
    if (want.has(id)) continue;
    const unit = f.endsWith(".conf") ? `awg-quick@${f.replace(".conf", "")}` : f.replace(".service", "");
    await run("systemctl", ["disable", "--now", unit], 20000);
    await fsp.rm(f.endsWith(".conf") ? `/etc/amnezia/amneziawg/${f}` : `/etc/systemd/system/${f}`, { force: true });
    for (const side of ["entry", "exit"]) await fsp.rm(path.join(stateDir, `tun-${id}-${side}.hash`), { force: true });
    removed.push(unit);
  }
  if (removed.length) await run("systemctl", ["daemon-reload"], 10000);
  if (!done.length && !failed.length && !removed.length) return null;
  return {
    name: "tunnels (main server)",
    status: failed.length ? "error" : "applied",
    detail: [done.length ? M("apply.tunInstalled", { list: done.join(", ") }) : "", removed.length ? M("apply.tunRemoved", { list: removed.join(", ") }) : "", ...failed].filter(Boolean).join(" · "),
  };
}

// ---------------------------------------------------------------- host firewall (main server)
/** Ports the main server must accept: user inbounds, tunnel listeners, Hysteria port hopping, HTTP(S). */
export function localPorts(ctx: Ctx): string[] {
  const out = new Set<string>(["80/tcp", "443/tcp"]);
  if (!ctx.local) return [...out];
  for (const ib of ctx.inbounds) {
    if (inboundNode(ctx, ib)?.id !== ctx.local.id || ib.hidden) continue;
    const udp = ["hysteria2", "wireguard"].includes(ib.protocol) || (ib.protocol === "openvpn" && ib.transport !== "tcp");
    out.add(`${ib.port}/${udp ? "udp" : "tcp"}`);
  }
  for (const p of nodePorts(ctx, ctx.local.id)) out.add(p);
  if (ctx.obf.portHopping.enabled && localOnly(ctx, "hysteria2").length) out.add(`${ctx.obf.portHopping.hopRange.replace("-", ":")}/udp`);
  return [...out];
}

async function applyFirewall(ctx: Ctx): Promise<Step | null> {
  if (process.env.E2B_SANDBOX === "true" || !fs.existsSync("/etc/systemd/system")) return null;
  const ports = localPorts(ctx);
  const ipt = ports.map((p) => { const [port, proto] = p.split("/"); return `iptables -A VVSM_IN -p ${proto} --dport ${port} -j ACCEPT`; });
  const script = [
    "set +e",
    "if command -v iptables >/dev/null; then",
    "  iptables -N VVSM_IN 2>/dev/null; iptables -F VVSM_IN",
    "  iptables -C INPUT -j VVSM_IN 2>/dev/null || iptables -I INPUT 1 -j VVSM_IN",
    ...ipt.map((l) => `  ${l}`),
    "fi",
    "if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q 'Status: active'; then",
    ...ports.map((p) => `  ufw allow ${p} >/dev/null 2>&1`),
    "fi",
    "exit 0",
  ].join("\n");
  const r = await run("bash", ["-c", script], 30000);
  return { name: "firewall", status: r.ok ? "applied" : "error", detail: M("apply.firewall", { ports: ports.join(", ") }) };
}
