/* eslint-disable @typescript-eslint/no-explicit-any */
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { admins, cleanIps, inbounds, nodes, orders, plans, posts, routingRules, settings, subscriptions, trafficStats, tunnels, users, vpnSessions } from "@/db/schema";
import { DEFAULTS, SETTING_GROUPS, getSettings, saveSettings, type Group } from "@/lib/settings";
import { hashPassword, previewNoLogin } from "@/lib/auth";
import { awgParams, isOvpnPki, openvpnTunnelPki, randomPassword, shortId, token, uuid, x25519 } from "@/lib/keys";
import { GB } from "@/lib/users";
import { logEvent } from "@/lib/telegram";
import { scheduleApply } from "@/lib/cores";

const g = globalThis as any;

export async function ensureBootstrap(): Promise<void> {
  if (g.__vvsmBooted) return;
  if (g.__vvsmBootPromise) return g.__vvsmBootPromise;
  g.__vvsmBootPromise = bootstrapOnce().then(() => {
    g.__vvsmBooted = true;
  }).catch((error: unknown) => {
    g.__vvsmBootPromise = undefined;
    throw error;
  });
  return g.__vvsmBootPromise;
}

async function bootstrapOnce() {
  // settings rows
  const existing = new Set((await db.select({ k: settings.key }).from(settings)).map((r) => r.k));
  for (const grp of SETTING_GROUPS) {
    if (existing.has(grp)) continue;
    let v: any = DEFAULTS[grp as Group];
    if (grp === "obfuscation") v = { ...v, hysteriaObfsPassword: randomPassword(16) };
    await saveSettings(grp as Group, v);
  }
  // AmneziaWG obfuscation parameters: random per installation
  const wgs = await getSettings("wireguard");
  if (!wgs.h1) await saveSettings("wireguard", { ...wgs, ...awgParams() });
  // Psiphon: fill the verified public-network configuration when no own IDs were entered
  const psi = await getSettings("psiphon");
  if (!psi.propagationChannelId || !psi.sponsorId || !psi.remoteServerListUrl) {
    const d = DEFAULTS.psiphon;
    await saveSettings("psiphon", { ...psi, propagationChannelId: psi.propagationChannelId || d.propagationChannelId, sponsorId: psi.sponsorId || d.sponsorId, remoteServerListUrl: psi.remoteServerListUrl || d.remoteServerListUrl, remoteServerListSignaturePublicKey: psi.remoteServerListSignaturePublicKey || d.remoteServerListSignaturePublicKey });
  }
  // cover site: a random secret shop link per installation
  const cv = await getSettings("cover");
  if (!cv.shopPath) await saveSettings("cover", { ...cv, shopPath: `shop-${token(8).toLowerCase()}` });
  // admin
  const a = await db.select({ id: admins.id }).from(admins).limit(1);
  if (!a.length) {
    const pw = process.env.ADMIN_PASSWORD || "Vvsm@Admin2025";
    await db.insert(admins).values({
      username: process.env.ADMIN_USERNAME || "admin",
      passwordHash: hashPassword(pw),
      mustChange: !process.env.ADMIN_PASSWORD,
    });
    console.log(`[vvsm] admin account created: ${process.env.ADMIN_USERNAME || "admin"}`);
  }
  const gen = await getSettings("general");
  // local node
  const ln = await db.select({ id: nodes.id }).from(nodes).where(eq(nodes.isLocal, true)).limit(1);
  if (!ln.length)
    await db.insert(nodes).values({
      name: "Main server",
      countryCode: process.env.NODE_COUNTRY || "DE",
      country: "",
      city: "",
      domain: gen.domain,
      role: "entry",
      isLocal: true,
      status: "online",
      agentToken: token(32),
      lastSeenAt: new Date(),
      capacityMbps: 1000,
    });
  // plans
  const pl = await db.select({ id: plans.id }).from(plans).limit(1);
  if (!pl.length)
    await db.insert(plans).values([
      { name: "Starter", description: "plan.starter", priceUsd: 5, durationDays: 30, dataLimitGb: 50, deviceLimit: 2, sortOrder: 1 },
      { name: "Standard", description: "plan.standard", priceUsd: 9, durationDays: 30, dataLimitGb: 150, deviceLimit: 3, featured: true, sortOrder: 2 },
      { name: "Pro", description: "plan.pro", priceUsd: 15, durationDays: 30, dataLimitGb: 500, deviceLimit: 5, sortOrder: 3 },
      { name: "Annual", description: "plan.annual", priceUsd: 99, durationDays: 365, dataLimitGb: 0, deviceLimit: 5, sortOrder: 4 },
    ]);
  // inbounds
  const ib = await db.select({ id: inbounds.id }).from(inbounds).limit(1);
  if (!ib.length) {
    const rk = () => x25519();
    const r1 = rk();
    const r2 = rk();
    const wg = rk();
    const obf = (await getSettings("obfuscation")).hysteriaObfsPassword;
    const p = () => `/${token(10).toLowerCase()}`;
    await db.insert(inbounds).values([
      { name: "VLESS Reality", protocol: "vless", transport: "tcp", security: "reality", port: 8443, flow: "xtls-rprx-vision", sni: "www.microsoft.com", realityDest: "www.microsoft.com:443", privateKey: r1.privateKeyUrl, publicKey: r1.publicKeyUrl, shortId: shortId() },
      { name: "VMess WS", protocol: "vmess", transport: "ws", security: "tls", port: 10001, hidden: true, path: p(), listen: "127.0.0.1" },
      { name: "Trojan gRPC", protocol: "trojan", transport: "grpc", security: "tls", port: 10002, hidden: true, serviceName: `tj${token(8).toLowerCase()}`, listen: "127.0.0.1" },
      { name: "VLESS WS CDN", protocol: "vless", transport: "ws", security: "tls", port: 10003, hidden: true, path: p(), useCleanIp: true, listen: "127.0.0.1" },
      { name: "Hysteria2", protocol: "hysteria2", transport: "udp", security: "tls", port: 4443, obfs: obf, upMbps: 0, downMbps: 0 },
      { name: "WireGuard", protocol: "wireguard", transport: "udp", security: "none", port: 51820, privateKey: wg.privateKey, publicKey: wg.publicKey },
      { name: "OpenVPN", protocol: "openvpn", transport: "udp", security: "tls", port: 1194 },
      { name: "Psiphon chain", protocol: "psiphon", transport: "tcp", security: "reality", port: 8444, flow: "xtls-rprx-vision", sni: "www.cloudflare.com", realityDest: "www.cloudflare.com:443", privateKey: r2.privateKeyUrl, publicKey: r2.publicKeyUrl, shortId: shortId(), enabled: false },
    ]);
  }
  // posts
  const ps = await db.select({ id: posts.id }).from(posts).limit(1);
  if (!ps.length) await db.insert(posts).values(DEFAULT_POSTS);

  const demoOn = process.env.SEED_DEMO !== "false";
  if (demoOn) {
    const uc = await db.select({ n: sql<number>`count(*)::int` }).from(users);
    if ((uc[0]?.n ?? 0) === 0) {
      try {
        await seedDemo();
      } catch (e) {
        console.error("[vvsm] demo seed failed", e);
      }
    }
  }
  await migrateInsecureTunnels();
  if (previewNoLogin()) {
    console.warn("[vvsm] PREVIEW: admin panel and portal are open without login; do not use this mode on a public server.");
    await logEvent("warn", "auth", "Preview mode: admin/portal login skipped");
  }
  await logEvent("info", "system", "panel started");
  // write initial core configs shortly after boot (no-op on hosts without the cores)
  scheduleApply(10000);
}

/** Xray 26 refuses plain VLESS/Trojan tunnels: upgrade them to REALITY once (keys generated). */
async function migrateInsecureTunnels() {
  const rows = await db.select().from(tunnels).where(sql`${tunnels.carrier} in ('vless','trojan') and ${tunnels.security} = 'none'`);
  for (const t of rows) {
    const k = x25519();
    await db.update(tunnels).set({ security: "reality", transport: ["tcp", "grpc", "xhttp"].includes(t.transport) ? t.transport : "tcp", privateKey: k.privateKeyUrl, publicKey: k.publicKeyUrl, shortId: shortId(), sni: t.sni && t.sni !== "" ? t.sni : "www.microsoft.com", realityDest: t.realityDest || "www.microsoft.com:443" }).where(eq(tunnels.id, t.id));
  }
  if (rows.length) await logEvent("warn", "tunnels", `${rows.length} VLESS/Trojan tunnel(s) without encryption upgraded to REALITY (required by Xray 26)`);
  // OpenVPN tunnels: static-key mode is deprecated/removed in OpenVPN 2.7 → per-tunnel PKI + tls-crypt
  for (const t of await db.select().from(tunnels).where(eq(tunnels.carrier, "openvpn"))) {
    if (isOvpnPki(t.secret)) continue;
    try { await db.update(tunnels).set({ secret: openvpnTunnelPki(t.id) }).where(eq(tunnels.id, t.id)); } catch (e) { console.error("[vvsm] openvpn tunnel pki", e); }
  }
}

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const chunk = async <T,>(arr: T[], size: number, fn: (c: T[]) => Promise<unknown>) => {
  for (let i = 0; i < arr.length; i += size) await fn(arr.slice(i, i + size));
};

export async function seedDemo() {
  const R = rng(20250611);
  const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];
  const now = Date.now();
  const DAY = 86400000;

  // nodes
  const N = [
    ["Frankfurt", "DE", "Germany", "Frankfurt", 50.11, 8.68, "exit", "203.0.113.11"],
    ["Amsterdam", "NL", "Netherlands", "Amsterdam", 52.37, 4.89, "exit", "203.0.113.12"],
    ["Helsinki", "FI", "Finland", "Helsinki", 60.17, 24.94, "exit", "203.0.113.13"],
    ["Istanbul", "TR", "Türkiye", "Istanbul", 41.01, 28.97, "relay", "203.0.113.14"],
    ["Dubai", "AE", "UAE", "Dubai", 25.2, 55.27, "relay", "203.0.113.15"],
    ["Tehran Entry", "IR", "Iran", "Tehran", 35.69, 51.39, "entry", "198.51.100.21"],
    ["New York", "US", "United States", "New York", 40.71, -74.0, "exit", "203.0.113.17"],
    ["Singapore", "SG", "Singapore", "Singapore", 1.35, 103.82, "exit", "203.0.113.18"],
  ] as const;
  const nodeRows = await db
    .insert(nodes)
    .values(
      N.map((n, i) => ({
        name: n[0], countryCode: n[1], country: n[2], city: n[3], lat: n[4], lng: n[5], role: n[6], ip: n[7],
        domain: `${n[1].toLowerCase()}${i + 1}.vvsm.online`, status: i === 4 ? "maintenance" : i === 6 ? "offline" : "online",
        cpu: Math.round(15 + R() * 60), ram: Math.round(30 + R() * 55), load: Number((R() * 2.5).toFixed(2)),
        rxBps: Math.round(R() * 40e6), txBps: Math.round(R() * 55e6), capacityMbps: pick([1000, 2000, 10000]),
        usersCount: Math.round(10 + R() * 40), agentToken: token(32), lastSeenAt: new Date(now - R() * 60000), demo: true,
      }))
    )
    .returning();
  const id = (name: string) => nodeRows.find((n) => n.name === name)!.id;
  await db.insert(tunnels).values([
    { name: "IR → DE (VLESS WS)", mode: "direct", carrier: "vless", transport: "ws", security: "tls", entryNodeId: id("Tehran Entry"), exitNodeId: id("Frankfurt"), listenPort: 4443, sni: "de1.vvsm.online", path: "/tun-a1", secret: uuid(), status: "active", latencyMs: 74, trafficBytes: 8.2e11 },
    { name: "IR ⇄ NL (Reverse VLESS)", mode: "reverse", carrier: "vless", transport: "tcp", security: "reality", sni: "www.microsoft.com", entryNodeId: id("Tehran Entry"), exitNodeId: id("Amsterdam"), listenPort: 4444, secret: uuid(), status: "active", latencyMs: 96, trafficBytes: 4.1e11 },
    { name: "TR → FI (VMess gRPC)", mode: "direct", carrier: "vmess", transport: "grpc", security: "tls", entryNodeId: id("Istanbul"), exitNodeId: id("Helsinki"), listenPort: 4445, serviceName: "tunnel", sni: "fi3.vvsm.online", secret: uuid(), status: "active", latencyMs: 61, trafficBytes: 2.3e11 },
  ]);

  // users
  const first = ["ali","sara","reza","maryam","omid","nika","kian","dina","arman","leila","pouya","sina","mina","amir","hana","emil","olga","ivan","anna","lukas","jonas","mia","felix","nora","oleg","petr","katja","timur","darya","ben"];
  const pls = await db.select().from(plans);
  const statuses = ["active", "active", "active", "active", "active", "active", "active", "expired", "limited", "disabled"];
  const rows: (typeof users.$inferInsert)[] = [];
  for (let i = 0; i < 140; i++) {
    const plan = pick(pls);
    const st = pick(statuses);
    const created = now - Math.pow(R(), 0.8) * 90 * DAY;
    const limit = plan.dataLimitGb * GB;
    const w = x25519();
    const used = limit ? (st === "limited" ? limit : R() * limit * 0.9) : R() * 600 * GB;
    rows.push({
      username: `${pick(first)}${Math.floor(100 + R() * 900)}_${i}`,
      email: "", passwordHash: "", subToken: token(24), uuid: uuid(), vpnPassword: randomPassword(16),
      wgPrivateKey: w.privateKey, wgPublicKey: w.publicKey, status: st, planId: plan.id,
      expiresAt: new Date(st === "expired" ? now - R() * 20 * DAY : now + (1 + R() * 29) * DAY),
      dataLimitBytes: limit, usedBytes: Math.round(used), monthUsedBytes: Math.round(used * 0.6),
      speedLimitMbps: plan.speedLimitMbps, deviceLimit: plan.deviceLimit, source: R() > 0.3 ? "purchase" : "admin",
      demo: true, createdAt: new Date(created), lastOnlineAt: st === "active" && R() < 0.3 ? new Date(now - R() * 4 * 60000) : new Date(now - R() * 10 * DAY),
    });
  }
  const urows: { id: number; username: string; planId: number | null; expiresAt: Date | null; createdAt: Date }[] = [];
  await chunk(rows, 50, async (c) => {
    urows.push(...(await db.insert(users).values(c).returning({ id: users.id, username: users.username, planId: users.planId, expiresAt: users.expiresAt, createdAt: users.createdAt })));
  });
  await db.execute(sql`update users set wg_ip = '10.66.' || (id / 250)::text || '.' || ((id % 250) + 2)::text where wg_ip = ''`);
  await chunk(
    urows.map((u) => {
      const plan = pls.find((p) => p.id === u.planId)!;
      return { userId: u.id, planId: u.planId, startsAt: u.createdAt, endsAt: u.expiresAt || new Date(), status: "active", priceUsd: plan.priceUsd, dataLimitBytes: plan.dataLimitGb * GB, createdAt: u.createdAt };
    }),
    100,
    (c) => db.insert(subscriptions).values(c)
  );

  // orders
  const cur = ["usdttrc20", "usdttrc20", "usdttrc20", "usdtbsc", "btc", "eth", "ltc", "trx"];
  const weights = [0.3, 0.7, 0.9, 1];
  const orderRows: (typeof orders.$inferInsert)[] = [];
  for (let d = 89; d >= 0; d--) {
    const dayStart = new Date(now - d * DAY);
    dayStart.setHours(0, 0, 0, 0);
    const wd = dayStart.getDay();
    const count = Math.max(1, Math.round(2.5 + ((89 - d) / 89) * 4.5 + (wd === 5 || wd === 6 ? 1.5 : 0) + (R() - 0.5) * 3));
    for (let k = 0; k < count; k++) {
      const created = dayStart.getTime() + R() * DAY;
      if (created > now - 60000) continue;
      const r = R();
      const plan = pls[weights.findIndex((w) => r <= w)] || pls[0];
      const c = pick(cur);
      const roll = R();
      const status = roll < 0.93 ? "paid" : roll < 0.97 ? "expired" : "failed";
      const u = pick(urows);
      orderRows.push({
        id: uuid(), userId: u.id, kind: R() < 0.42 ? "new" : "renew", planId: plan.id, email: "", username: u.username,
        amountUsd: plan.priceUsd, payCurrency: c, network: c.startsWith("usdt") ? (c === "usdtbsc" ? "BEP20" : "TRC20") : c.toUpperCase(),
        payAmount: String(plan.priceUsd), payAddress: "demo", provider: "nowpayments", providerRef: String(Math.floor(R() * 1e9)),
        status, expiresAt: new Date(created + 3600000), paidAt: status === "paid" ? new Date(created + (3 + R() * 22) * 60000) : null,
        fulfilledAt: status === "paid" ? new Date(created + (3 + R() * 22) * 60000) : null, demo: true, createdAt: new Date(created),
      });
    }
  }
  const pl0 = pls[1];
  for (let k = 0; k < 3; k++)
    orderRows.push({ id: uuid(), userId: pick(urows).id, kind: "renew", planId: pl0.id, amountUsd: pl0.priceUsd, payCurrency: "usdttrc20", network: "TRC20", payAmount: String(pl0.priceUsd + 0.0123 * (k + 1)), payAddress: "demo", provider: "manual", status: k === 0 ? "confirming" : "pending", expiresAt: new Date(now + 40 * 60000), demo: true, createdAt: new Date(now - (k + 1) * 6 * 60000) });
  await chunk(orderRows, 100, (c) => db.insert(orders).values(c));

  // traffic
  const share: Record<string, number> = { vless: 0.3, vmess: 0.12, trojan: 0.14, wireguard: 0.18, openvpn: 0.06, hysteria2: 0.15, psiphon: 0.05 };
  const tr: (typeof trafficStats.$inferInsert)[] = [];
  const hourNow = new Date(now);
  hourNow.setMinutes(0, 0, 0);
  for (let h = 14 * 24; h >= 0; h--) {
    const ts = new Date(hourNow.getTime() - h * 3600000);
    const diurnal = 0.55 + 0.45 * Math.sin(((ts.getHours() - 14) / 24) * Math.PI * 2 + Math.PI / 2);
    const growth = 0.82 + ((14 * 24 - h) / (14 * 24)) * 0.3;
    const wk = ts.getDay() === 5 || ts.getDay() === 6 ? 1.12 : 1;
    for (const [p, sh] of Object.entries(share)) {
      const total = 9e9 * diurnal * growth * wk * sh * (0.85 + R() * 0.3);
      tr.push({ ts, protocol: p, upBytes: Math.round(total * 0.12), downBytes: Math.round(total * 0.88), connections: Math.round((20 + R() * 40) * sh * 3.3), demo: true });
    }
  }
  for (let d = 90; d > 14; d--) {
    const ts = new Date(hourNow.getTime() - d * DAY);
    ts.setHours(12);
    const growth = 0.55 + ((90 - d) / 90) * 0.5;
    for (const [p, sh] of Object.entries(share)) {
      const total = 9e9 * 24 * 0.7 * growth * sh * (0.85 + R() * 0.3);
      tr.push({ ts, protocol: p, upBytes: Math.round(total * 0.12), downBytes: Math.round(total * 0.88), connections: Math.round((14 + R() * 30) * sh * 3.3), demo: true });
    }
  }
  await chunk(tr, 800, (c) => db.insert(trafficStats).values(c));

  // sessions
  const active = urows.slice(0, 60);
  const devs = ["Android", "iOS", "Windows", "macOS", "Linux", "Router"];
  const ccs = ["IR", "IR", "IR", "DE", "RU", "TR", "AE", "NL", "CN", "US"];
  const protos = Object.keys(share);
  await db.insert(vpnSessions).values(
    active.slice(0, 42).map((u) => ({
      userId: u.id, username: u.username, nodeId: pick(nodeRows).id, protocol: pick(protos), clientIp: `${Math.floor(20 + R() * 200)}.${Math.floor(R() * 255)}.${Math.floor(R() * 255)}.${Math.floor(1 + R() * 253)}`,
      country: pick(ccs), device: pick(devs), upBytes: Math.round(R() * 3e8), downBytes: Math.round(R() * 2.4e9), demo: true, startedAt: new Date(now - R() * 6 * 3600000),
    }))
  );

  // clean ips + rules
  const cf = ["104.16", "104.17", "172.64", "162.159", "188.114", "141.101"];
  await db.insert(cleanIps).values(
    Array.from({ length: 14 }, (_, i) => ({
      ip: `${pick(cf)}.${Math.floor(R() * 255)}.${Math.floor(1 + R() * 253)}`, port: 443, latencyMs: Math.round(35 + R() * 140), lossPct: pick([0, 0, 0, 5, 10]),
      provider: "cloudflare", status: i < 11 ? "clean" : "blocked", note: "", demo: true, checkedAt: new Date(now - R() * 3 * 3600000),
    }))
  );
  await db.insert(routingRules).values([
    { name: "Telegram via Frankfurt", ruleType: "geoip", match: "telegram", outbound: "proxy", priority: 10, demo: true },
    { name: "Block torrent trackers", ruleType: "domain", match: "keyword:tracker\nkeyword:announce", outbound: "block", priority: 20, demo: true },
    { name: "Local banks direct", ruleType: "geosite", match: "ir", outbound: "direct", priority: 30, demo: true },
    { name: "Gaming ports direct", ruleType: "port", match: "3074,27015-27030", outbound: "direct", priority: 40, demo: true },
  ]);
  console.log("[vvsm] demo data seeded");
}

export async function clearDemo() {
  await db.delete(vpnSessions).where(eq(vpnSessions.demo, true));
  await db.delete(trafficStats).where(eq(trafficStats.demo, true));
  await db.delete(orders).where(eq(orders.demo, true));
  await db.execute(sql`delete from subscriptions where user_id in (select id from users where demo = true)`);
  await db.delete(users).where(eq(users.demo, true));
  await db.execute(sql`delete from tunnels where entry_node_id in (select id from nodes where demo = true) or exit_node_id in (select id from nodes where demo = true)`);
  await db.delete(nodes).where(eq(nodes.demo, true));
  await db.delete(cleanIps).where(eq(cleanIps.demo, true));
  await db.delete(routingRules).where(eq(routingRules.demo, true));
  const cur = await getSettings("general");
  await saveSettings("general", { ...cur, demoMode: false });
}

const DEFAULT_POSTS = [
  {
    slug: "getting-started", lang: "en", title: "Getting started with VVSM VPN",
    excerpt: "Buy a plan with crypto, import your subscription link and connect in under two minutes.",
    body: "## 1. Choose a plan\nPick a plan on the pricing page and pay with USDT, BTC, ETH or another supported coin. Your account is created automatically after the payment is confirmed.\n\n## 2. Import your subscription\nOpen your subscription page and tap the button for your app (Hiddify, v2rayNG, Streisand, Clash, sing-box ...). The profile contains every protocol included in your plan.\n\n## 3. Renew anytime\nSign in to the client area and renew with crypto — the new period is added on top of your remaining time.",
  },
  {
    slug: "getting-started-fa", lang: "fa", title: "راهنمای شروع کار با VVSM",
    excerpt: "اشتراک را با رمزارز بخرید، لینک اشتراک را وارد برنامه کنید و در کمتر از دو دقیقه متصل شوید.",
    body: "## ۱. انتخاب اشتراک\nدر صفحه قیمت‌ها یک اشتراک انتخاب کنید و با تتر، بیت‌کوین، اتریوم یا سایر ارزهای پشتیبانی‌شده پرداخت کنید. حساب شما پس از تأیید پرداخت به‌صورت خودکار ساخته می‌شود.\n\n## ۲. وارد کردن لینک اشتراک\nصفحه اشتراک خود را باز کنید و روی دکمهٔ برنامهٔ موردنظر (Hiddify، v2rayNG، Streisand، Clash، sing-box ...) بزنید. این پروفایل همهٔ پروتکل‌های اشتراک شما را دارد.\n\n## ۳. تمدید در هر زمان\nوارد پنل کاربری شوید و با رمزارز تمدید کنید؛ مدت جدید به زمان باقی‌ماندهٔ شما اضافه می‌شود.",
  },
  {
    slug: "getting-started-ru", lang: "ru", title: "Быстрый старт с VVSM VPN",
    excerpt: "Оплатите тариф криптовалютой, импортируйте ссылку подписки и подключитесь меньше чем за две минуты.",
    body: "## 1. Выберите тариф\nВыберите тариф на странице цен и оплатите USDT, BTC, ETH или другой поддерживаемой монетой. Аккаунт создаётся автоматически после подтверждения платежа.\n\n## 2. Импортируйте подписку\nОткройте страницу подписки и нажмите кнопку вашего приложения (Hiddify, v2rayNG, Streisand, Clash, sing-box ...). Профиль содержит все протоколы вашего тарифа.\n\n## 3. Продлевайте в любое время\nВойдите в личный кабинет и продлите подписку криптовалютой — новый период добавляется к оставшемуся времени.",
  },
  {
    slug: "getting-started-de", lang: "de", title: "Erste Schritte mit VVSM VPN",
    excerpt: "Tarif per Krypto bezahlen, Abo-Link importieren und in unter zwei Minuten verbunden sein.",
    body: "## 1. Tarif wählen\nWähle auf der Preisseite einen Tarif und bezahle mit USDT, BTC, ETH oder einer anderen unterstützten Münze. Dein Konto wird nach Zahlungsbestätigung automatisch erstellt.\n\n## 2. Abo importieren\nÖffne deine Abo-Seite und tippe auf die Schaltfläche deiner App (Hiddify, v2rayNG, Streisand, Clash, sing-box ...). Das Profil enthält alle Protokolle deines Tarifs.\n\n## 3. Jederzeit verlängern\nMelde dich im Kundenbereich an und verlängere per Krypto — der neue Zeitraum wird an die Restlaufzeit angehängt.",
  },
  {
    slug: "choosing-a-protocol", lang: "en", title: "Which protocol should I use?",
    excerpt: "VLESS Reality, Hysteria2, WireGuard, OpenVPN — a short guide to picking the right one for your network.",
    body: "## Heavy filtering\nUse **VLESS + Reality** or **Trojan over gRPC** behind a CDN-looking route. They are hardest to fingerprint.\n\n## Speed on unstable links\n**Hysteria2** (QUIC) shines on lossy mobile networks.\n\n## Simplicity\n**WireGuard** is fast and native on every platform, but is easier to detect. **OpenVPN** works almost everywhere, including TCP/443.",
  },
  {
    slug: "choosing-a-protocol-fa", lang: "fa", title: "کدام پروتکل را انتخاب کنم؟",
    excerpt: "VLESS Reality، Hysteria2، WireGuard و OpenVPN — راهنمای کوتاه انتخاب پروتکل مناسب.",
    body: "## فیلترینگ شدید\nاز **VLESS + Reality** یا **Trojan روی gRPC** با مسیر پنهان استفاده کنید؛ شناسایی آن‌ها سخت‌تر است.\n\n## سرعت در شبکه‌های ناپایدار\n**Hysteria2** (مبتنی بر QUIC) در شبکه‌های موبایل با افت بسته عملکرد عالی دارد.\n\n## سادگی\n**WireGuard** سریع و در همهٔ سیستم‌عامل‌ها بومی است ولی راحت‌تر شناسایی می‌شود. **OpenVPN** تقریباً همه‌جا کار می‌کند، حتی روی TCP/443.",
  },
];
