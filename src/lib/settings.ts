/* eslint-disable @typescript-eslint/no-explicit-any */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

// Every setting group used by the panel. Security / DNS / routing / obfuscation /
// WireGuard / Psiphon / clean-IP feed the same config generator (lib/cores.ts)
// and the subscription builder (lib/links.ts), so they always stay in sync.
export const DEFAULTS = {
  general: {
    siteName: "VVSM",
    domain: process.env.PANEL_DOMAIN || "vvsm.online",
    supportUrl: "",
    supportEmail: "",
    defaultLanguage: "fa",
    publicSite: true,
    demoMode: process.env.SEED_DEMO !== "false",
  },
  security: {
    tls: { certMode: "letsencrypt", certPath: "/etc/vvsm/certs/fullchain.pem", keyPath: "/etc/vvsm/certs/privkey.pem", minVersion: "1.2", maxVersion: "1.3", alpn: "h2,http/1.1", fingerprint: "chrome", allowInsecure: false, pinSha256: "" },
    ech: { enabled: false, configList: "", serverKeys: "" },
    zeroRtt: { quicEarlyData: true, wsEarlyData: true, tcpFastOpen: true },
    sniSpoof: { enabled: false, fakeSni: "", fakeHost: "" },
    domainsPorts: { panelDomain: process.env.PANEL_DOMAIN || "", subDomain: "", acmeEmail: process.env.CERTBOT_EMAIL || "", allowedPortRanges: "", blockedPorts: "25,465,587" },
    access: { sessionHours: 12, maxAttempts: 5, lockMinutes: 15, ipAllowlist: "", minPasswordLength: 10, requireComplex: true, twoFactorRequired: false },
  },
  obfuscation: {
    fragment: { enabled: false, packets: "tlshello", length: "100-200", interval: "10-20" },
    noise: { enabled: false, packet: "rand:50-100", delay: "10-16" },
    mux: { enabled: false, concurrency: 8 },
    hysteriaObfsPassword: "",
    portHopping: { enabled: false, hopRange: "20000-40000" },
    httpHeaderObfs: { enabled: false, fakeHost: "www.speedtest.net" },
    padding: { enabled: true, length: "100-1000" },
  },
  routing: {
    blockAds: true, blockTrackers: true, blockAdult: false, blockMalware: true, blockPhishing: true, blockMiners: true,
    blockQuic: false, blockBittorrent: true,
    directInternal: false, directIran: true, directChina: false, directRussia: false,
    bypassSanctions: true, sanctionsOutbound: "direct",
    domainStrategy: "IPIfNonMatch", defaultOutbound: "direct",
    random: { enabled: false, strategy: "random" },
    geoAutoUpdate: true, geoSource: "chocolate4u", updateIntervalHours: 24,
  },
  dns: {
    queryStrategy: "UseIP", disableCache: false,
    doh: { enabled: true, servers: "https://1.1.1.1/dns-query\nhttps://8.8.8.8/dns-query\nhttps://dns.quad9.net/dns-query" },
    antiCensor: { enabled: false, provider: "shecan", servers: "", domains: "geosite:sanctioned" },
    local: { enabled: true, hosts: "" },
    fakeDns: { enabled: false, pool: "198.18.0.0/15", poolSize: 65535 },
  },
  hidden: { enabled: true, decoyUrl: "https://www.wikipedia.org", hsts: true, reloadNginx: true },
  psiphon: {
    // public Psiphon network configuration (verified working) — replace with your own IDs if you have them
    enabled: false, propagationChannelId: "FFFFFFFFFFFFFFFF", sponsorId: "FFFFFFFFFFFFFFFF",
    remoteServerListUrl: "https://s3.amazonaws.com//psiphon/web/mjr4-p23r-puwl/server_list_compressed",
    remoteServerListSignaturePublicKey: "MIICIDANBgkqhkiG9w0BAQEFAAOCAg0AMIICCAKCAgEAt7Ls+/39r+T6zNW7GiVpJfzq/xvL9SBH5rIFnk0RXYEYavax3WS6HOD35eTAqn8AniOwiH+DOkvgSKF2caqk/y1dfq47Pdymtwzp9ikpB1C5OfAysXzBiwVJlCdajBKvBZDerV1cMvRzCKvKwRmvDmHgphQQ7WfXIGbRbmmk6opMBh3roE42KcotLFtqp0RRwLtcBRNtCdsrVsjiI1Lqz/lH+T61sGjSjQ3CHMuZYSQJZo/KrvzgQXpkaCTdbObxHqb6/+i1qaVOfEsvjoiyzTxJADvSytVtcTjijhPEV6XskJVHE1Zgl+7rATr/pDQkw6DPCNBS1+Y6fy7GstZALQXwEDN/qhQI9kWkHijT8ns+i1vGg00Mk/6J75arLhqcodWsdeG/M/moWgqQAnlZAGVtJI1OgeF5fsPpXu4kctOfuZlGjVZXQNW34aOzm8r8S0eVZitPlbhcPiR4gT/aSMz/wd8lZlzZYsje/Jr8u/YtlwjjreZrGRmG8KMOzukV3lLmMppXFMvl4bxv6YFEmIuTsOhbLTwFgh7KYNjodLj/LsqRVfwz31PgWQFTEPICV7GCvgVlPRxnofqKSjgTWI4mxDhBpVcATvaoBl1L/6WLbFvBsoAUBItWwctO2xalKxF5szhGm8lccoc5MZr8kfE0uxMgsxz4er68iCID+rsCAQM=",
    targetServerEntry: "", region: "", localSocksPort: 1081, localHttpPort: 8118,
  },
  // WireGuard runs on AmneziaWG (userspace engine, no kernel module). "amnezia" adds DPI obfuscation
  // (needs AmneziaWG/AmneziaVPN or Clash-Meta clients); "standard" stays compatible with every WireGuard app.
  wireguard: {
    interfaceAddress: "10.66.0.1/16", clientDns: "1.1.1.1,8.8.8.8", allowedIps: "0.0.0.0/0,::/0", mtu: 1280, persistentKeepalive: 25, endpointOverride: "",
    mode: "amnezia", jc: 4, jmin: 40, jmax: 70, s1: 0, s2: 0, h1: 0, h2: 0, h3: 0, h4: 0,
  },
  cleanip: {
    sources: ["manual", "cloudflare"], ranges: "104.16.0.0/20\n172.64.0.0/20\n162.159.0.0/20", ports: "443,2053,2083,2087,2096,8443",
    sni: "speed.cloudflare.com", timeoutMs: 2500, concurrency: 60, sample: 80, maxLatencyMs: 800, maxLossPct: 40,
    auto: true, maxIps: 5, keepOriginal: false,
  },
  backup: { auto: true, interval: "daily", keep: 7, dir: "/var/backups/vvsm", telegram: false },
  maintenance: {
    enabled: false, title: "", message: "", endsAt: "", allowIps: "", keepSubscriptions: true, keepPortal: false, allowNew: false, showSupport: true,
  },
  cover: {
    enabled: false, theme: "network", lang: "fa", businessName: "", tagline: "", phone: "", email: "", address: "", city: "تهران",
    shopPath: "", hideShop: true,
  },
  updates: { autoCheck: true, channel: "stable", autoApply: true },
  limits: { onLimit: "disable", throttleMbps: 1, monthlyResetDay: 1, monthlyCapGb: 0, deviceDefault: 2, speedDefaultMbps: 0, resetTrafficOnRenew: true, expiryDays: 3 },
  subscription: {
    template: "aurora", allowUserTemplate: true, profileTitle: "VVSM VPN", announce: "", footer: "", supportLink: "",
    showUsage: true, showQr: true, showApps: true, allowTokenReset: true, updateIntervalHours: 12,
  },
  notifications: {
    telegram: { enabled: false, botToken: "", chatId: "", proxy: "" },
    events: { newOrder: true, renewal: true, userExpiring: true, userExpired: false, limitReached: true, nodeOffline: true, highCpu: true, backup: false, adminLogin: true },
    cpuThreshold: 90, diskThreshold: 90,
  },
  payments: {
    provider: "manual", testMode: true, currencies: ["usdttrc20", "usdtbsc", "btc", "eth", "ltc", "trx", "ton"],
    invoiceTtlMin: 60, underpaidTolerancePct: 1, allowNew: true, allowRenew: true,
    nowpayments: { apiKey: "", ipnSecret: "", sandbox: false },
    manual: { usdtTrc20Address: "", tronGridKey: "", otherWallets: "" },
  },
};

export type Defaults = typeof DEFAULTS;
export type Group = keyof Defaults;
export const SETTING_GROUPS = Object.keys(DEFAULTS) as Group[];

function merge(base: any, over: any): any {
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (base && typeof base === "object") {
    const out: any = { ...base };
    if (over && typeof over === "object" && !Array.isArray(over)) {
      for (const k of Object.keys(over)) out[k] = k in base ? merge(base[k], over[k]) : over[k];
    }
    return out;
  }
  if (over === undefined || over === null) return base;
  if (typeof base === "number") return Number.isFinite(Number(over)) ? Number(over) : base;
  if (typeof base === "boolean") return typeof over === "boolean" ? over : over === "true";
  if (typeof base === "string") return String(over);
  return over;
}

const g = globalThis as any;
const cache: Map<string, { v: any; at: number }> = (g.__vvsmSettings ??= new Map());

export async function getSettings<G extends Group>(group: G): Promise<Defaults[G]> {
  const hit = cache.get(group);
  if (hit && Date.now() - hit.at < 3000) return structuredClone(hit.v);
  const [row] = await db.select().from(settings).where(eq(settings.key, group)).limit(1);
  const v = merge(DEFAULTS[group], row?.value ?? {});
  cache.set(group, { v, at: Date.now() });
  return structuredClone(v);
}

export async function saveSettings<G extends Group>(group: G, value: unknown): Promise<Defaults[G]> {
  const [row] = await db.select().from(settings).where(eq(settings.key, group)).limit(1);
  const v = merge(merge(DEFAULTS[group], row?.value ?? {}), value);
  await db
    .insert(settings)
    .values({ key: group, value: v, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value: v, updatedAt: new Date() } });
  cache.delete(group);
  return v;
}

export function invalidateSettings() {
  cache.clear();
}
