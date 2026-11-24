/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { backups, logs, nodes, orders, serverMetrics, trafficStats, users } from "@/db/schema";
import { HY_STATS, XRAY_API, internalKey, refreshTunnelStatuses, scheduleApply } from "@/lib/cores";
import { run, sampleSystem } from "@/lib/system";
import { getSettings } from "@/lib/settings";
import { logEvent, notify } from "@/lib/telegram";
import { refreshOrder } from "@/lib/payments";
import { createBackup } from "@/lib/backup";

const g = globalThis as any;
const wgPrev: Map<string, { rx: number; tx: number }> = (g.__vvsmWgPrev ??= new Map());
const lastAlert: Record<string, number> = (g.__vvsmAlerts ??= {});

async function collectTraffic() {
  const per = new Map<string, { up: number; down: number; proto: string }>();
  const addU = (name: string, proto: string, up: number, down: number) => {
    if (!up && !down) return;
    const e = per.get(`${name}|${proto}`) || { up: 0, down: 0, proto };
    e.up += up; e.down += down;
    per.set(`${name}|${proto}`, e);
  };
  // Xray (per-user stats, reset after read)
  const x = await run("xray", ["api", "statsquery", `--server=${XRAY_API}`, "-reset"], 8000);
  if (x.ok) {
    try {
      const j = JSON.parse(x.out) as { stat?: { name: string; value?: string | number }[] };
      for (const s of j.stat || []) {
        const m = /^user>>>(.+)>>>traffic>>>(uplink|downlink)$/.exec(s.name);
        if (m && !m[1].startsWith("tunnel-")) addU(m[1], "vless", m[2] === "uplink" ? Number(s.value || 0) : 0, m[2] === "downlink" ? Number(s.value || 0) : 0);
      }
    } catch { /* ignore */ }
  }
  // Hysteria2
  try {
    const r = await fetch(`http://${HY_STATS}/traffic?clear=1`, { headers: { Authorization: internalKey() }, signal: AbortSignal.timeout(3000) });
    if (r.ok) for (const [name, v] of Object.entries((await r.json()) as Record<string, { tx: number; rx: number }>)) addU(name, "hysteria2", v.tx || 0, v.rx || 0);
  } catch { /* not running */ }
  // WireGuard (cumulative counters)
  const w = await run("awg", ["show", "awg0", "transfer"], 4000);
  if (w.ok && w.out) {
    const byKey = new Map((await db.select({ u: users.username, k: users.wgPublicKey }).from(users)).map((r) => [r.k, r.u]));
    for (const line of w.out.split("\n")) {
      const [key, rx, tx] = line.trim().split(/\s+/);
      const name = byKey.get(key);
      if (!name) continue;
      const prev = wgPrev.get(key);
      const R = Number(rx), T = Number(tx);
      if (prev && R >= prev.rx && T >= prev.tx) addU(name, "wireguard", R - prev.rx, T - prev.tx);
      wgPrev.set(key, { rx: R, tx: T });
    }
  }
  if (!per.size) return;
  const hour = new Date(); hour.setMinutes(0, 0, 0);
  const byProto = new Map<string, { up: number; down: number; n: number }>();
  const byUser = new Map<string, number>();
  for (const [k, v] of per) {
    const name = k.split("|")[0];
    byUser.set(name, (byUser.get(name) || 0) + v.up + v.down);
    const p = byProto.get(v.proto) || { up: 0, down: 0, n: 0 };
    p.up += v.up; p.down += v.down; p.n++;
    byProto.set(v.proto, p);
  }
  for (const [name, bytes] of byUser)
    await db.update(users).set({ usedBytes: sql`${users.usedBytes} + ${bytes}`, monthUsedBytes: sql`${users.monthUsedBytes} + ${bytes}`, lastOnlineAt: new Date() }).where(eq(users.username, name));
  for (const [proto, v] of byProto) {
    const [row] = await db.select().from(trafficStats).where(and(eq(trafficStats.ts, hour), eq(trafficStats.protocol, proto), eq(trafficStats.demo, false))).limit(1);
    if (row) await db.update(trafficStats).set({ upBytes: row.upBytes + v.up, downBytes: row.downBytes + v.down, connections: Math.max(row.connections, v.n) }).where(eq(trafficStats.id, row.id));
    else await db.insert(trafficStats).values({ ts: hour, protocol: proto, upBytes: v.up, downBytes: v.down, connections: v.n });
  }
}

async function enforceLimits() {
  const lim = await getSettings("limits");
  const now = new Date();
  const active = await db.select().from(users).where(eq(users.status, "active"));
  let changed = false;
  for (const u of active) {
    if (u.expiresAt && u.expiresAt < now) {
      await db.update(users).set({ status: "expired" }).where(eq(users.id, u.id));
      await notify("userExpired", `⌛ Subscription expired: <b>${u.username}</b>`);
      changed = true;
    } else if ((u.dataLimitBytes > 0 && u.usedBytes >= u.dataLimitBytes) || (u.monthlyLimitBytes > 0 && u.monthUsedBytes >= u.monthlyLimitBytes)) {
      if (lim.onLimit === "throttle" && u.speedLimitMbps !== lim.throttleMbps && u.dataLimitBytes > 0 && u.usedBytes < u.dataLimitBytes) {
        await db.update(users).set({ speedLimitMbps: lim.throttleMbps }).where(eq(users.id, u.id));
      } else await db.update(users).set({ status: "limited" }).where(eq(users.id, u.id));
      await notify("limitReached", `📉 Traffic limit reached: <b>${u.username}</b>`);
      changed = true;
    } else if (!u.notifiedExpiry && u.expiresAt && u.expiresAt.getTime() - now.getTime() < lim.expiryDays * 86400000) {
      await db.update(users).set({ notifiedExpiry: true }).where(eq(users.id, u.id));
      await notify("userExpiring", `⏰ <b>${u.username}</b> expires on ${u.expiresAt.toISOString().slice(0, 10)}`);
    }
  }
  if (changed) scheduleApply(1000);
}

async function systemTick() {
  const s = await sampleSystem();
  await db.insert(serverMetrics).values({ cpu: s.cpu, mem: s.mem, disk: s.disk, rxBps: s.rxBps, txBps: s.txBps, load1: s.load[0] || 0 });
  await db.update(nodes).set({ cpu: s.cpu, ram: s.mem, load: s.load[0] || 0, rxBps: s.rxBps, txBps: s.txBps, status: "online", lastSeenAt: new Date() }).where(eq(nodes.isLocal, true));
  const n = await getSettings("notifications");
  const alert = async (key: string, html: string) => {
    if (Date.now() - (lastAlert[key] || 0) < 30 * 60000) return;
    lastAlert[key] = Date.now();
    await notify("highCpu", html);
  };
  if (s.cpu >= n.cpuThreshold) await alert("cpu", `🔥 High CPU: ${s.cpu}%`);
  if (s.disk >= n.diskThreshold) await alert("disk", `💽 Disk usage: ${s.disk}%`);
  // remote nodes that stopped reporting
  const stale = await db.select().from(nodes).where(and(eq(nodes.isLocal, false), eq(nodes.status, "online"), eq(nodes.demo, false), lt(nodes.lastSeenAt, new Date(Date.now() - 120000))));
  for (const node of stale) {
    await db.update(nodes).set({ status: "offline" }).where(eq(nodes.id, node.id));
    await notify("nodeOffline", `🔴 Node offline: <b>${node.name}</b> (${node.ip || node.domain})`);
    await logEvent("warn", "nodes", `node ${node.name} offline`);
  }
  await refreshTunnelStatuses();
  const open = await db.select().from(orders).where(and(inArray(orders.status, ["pending", "confirming"]), eq(orders.demo, false))).limit(30);
  for (const o of open) await refreshOrder(o);
}

async function slowTick() {
  await db.delete(serverMetrics).where(lt(serverMetrics.ts, new Date(Date.now() - 2 * 86400000)));
  await db.delete(logs).where(lt(logs.ts, new Date(Date.now() - 30 * 86400000)));
  const lim = await getSettings("limits");
  const now = new Date();
  const key = `${now.getFullYear()}-${now.getMonth()}`;
  if (now.getDate() === Math.min(28, Math.max(1, lim.monthlyResetDay)) && g.__vvsmMonthReset !== key) {
    g.__vvsmMonthReset = key;
    await db.update(users).set({ monthUsedBytes: 0 });
    await db.update(users).set({ status: "active" }).where(and(eq(users.status, "limited"), sql`${users.dataLimitBytes} = 0 or ${users.usedBytes} < ${users.dataLimitBytes}`));
    scheduleApply();
  }
  const b = await getSettings("backup");
  if (b.auto) {
    const [last] = await db.select().from(backups).orderBy(desc(backups.createdAt)).limit(1);
    const every = (b.interval === "weekly" ? 7 : 1) * 86400000;
    if (!last || Date.now() - last.createdAt.getTime() > every) await createBackup("auto");
  }
  const r = await getSettings("routing");
  if (r.geoAutoUpdate && Date.now() - (g.__vvsmGeoAt || Date.now() - 3600000) > r.updateIntervalHours * 3600000) {
    g.__vvsmGeoAt = Date.now();
    const res = await run("bash", [`${process.cwd()}/scripts/update-geo.sh`], 180000);
    if (res.ok) scheduleApply();
  }
  g.__vvsmGeoAt ??= Date.now();
}

const guard = (name: string, fn: () => Promise<void>) => async () => {
  if (g[`__vvsmJob_${name}`]) return;
  g[`__vvsmJob_${name}`] = true;
  try { await fn(); } catch (e) { console.error(`[vvsm] job ${name}`, e); } finally { g[`__vvsmJob_${name}`] = false; }
};

export function startJobs() {
  if (g.__vvsmJobs) return;
  g.__vvsmJobs = true;
  setInterval(guard("traffic", async () => { await collectTraffic(); await enforceLimits(); }), 60000);
  setInterval(guard("system", systemTick), 60000);
  setInterval(guard("slow", slowTick), 10 * 60000);
  setTimeout(guard("system", systemTick), 5000);
}
