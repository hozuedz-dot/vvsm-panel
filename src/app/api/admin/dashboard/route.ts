/* eslint-disable @typescript-eslint/no-explicit-any */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getAdmin, unauthorized } from "@/lib/auth";
import { PROTOCOLS } from "@/lib/format";
import { sampleSystem } from "@/lib/system";

export const dynamic = "force-dynamic";

const RANGES: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 };

const rows = async (q: any): Promise<any[]> => (await db.execute(q)).rows as any[];

export async function GET(req: Request) {
  if (!(await getAdmin())) return unauthorized();
  const sp = new URL(req.url).searchParams;
  const range = sp.get("range") && RANGES[sp.get("range")!] ? sp.get("range")! : "7d";
  const protocol = sp.get("protocol") || "all";
  const kind = sp.get("kind") || "all";
  const days = RANGES[range];
  const ms = days * 86400000;
  const now = new Date();
  const from = new Date(now.getTime() - ms);
  const prevFrom = new Date(from.getTime() - ms);
  const unit = range === "24h" ? "hour" : "day";
  const step = unit === "hour" ? 3600000 : 86400000;
  const U = sql.raw(`'${unit}'`);
  const T = (d: Date) => sql`${d.toISOString()}::timestamp`;
  const protoOk = protocol !== "all" && (PROTOCOLS as readonly string[]).includes(protocol);
  const pc = protoOk ? sql`and protocol = ${protocol}` : sql``;
  const pcs = protoOk ? sql`and s.protocol = ${protocol}` : sql``;
  const kc = kind === "new" || kind === "renew" ? sql`and kind = ${kind}` : sql``;
  const koc = kind === "new" || kind === "renew" ? sql`and o.kind = ${kind}` : sql``;

  const start = Math.floor(from.getTime() / step) * step;
  const labels: number[] = [];
  for (let t = start; t <= now.getTime(); t += step) labels.push(t);
  const fill = (rs: any[], key: string) => {
    const m = new Map(rs.map((r) => [Number(r.b), Number(r[key] || 0)]));
    return labels.map((l) => m.get(l) || 0);
  };

  const [trafficRows, prevTraffic, orderRows, prevOrders, userRows, prevUsers, protoDist, planDist, coinDist, statusDist, totals, nodeRows, recent, top, sess, sessCount] = await Promise.all([
    rows(sql`select (extract(epoch from date_trunc(${U}, ts))*1000)::float8 as b, sum(up_bytes)::float8 as up, sum(down_bytes)::float8 as down, max(connections)::float8 as conns from traffic_stats where ts >= ${T(from)} ${pc} group by 1 order by 1`),
    rows(sql`select coalesce(sum(up_bytes+down_bytes),0)::float8 as total from traffic_stats where ts >= ${T(prevFrom)} and ts < ${T(from)} ${pc}`),
    rows(sql`select (extract(epoch from date_trunc(${U}, paid_at))*1000)::float8 as b, sum(amount_usd)::float8 as rev, count(*)::float8 as n, (count(*) filter (where kind='renew'))::float8 as renews from orders where status='paid' and paid_at >= ${T(from)} ${kc} group by 1 order by 1`),
    rows(sql`select coalesce(sum(amount_usd),0)::float8 as rev, count(*)::float8 as n, (count(*) filter (where kind='renew'))::float8 as renews from orders where status='paid' and paid_at >= ${T(prevFrom)} and paid_at < ${T(from)} ${kc}`),
    rows(sql`select (extract(epoch from date_trunc(${U}, created_at))*1000)::float8 as b, count(*)::float8 as n from users where created_at >= ${T(from)} group by 1 order by 1`),
    rows(sql`select count(*)::float8 as n from users where created_at >= ${T(prevFrom)} and created_at < ${T(from)}`),
    rows(sql`select protocol as name, sum(up_bytes+down_bytes)::float8 as value from traffic_stats where ts >= ${T(from)} group by protocol order by value desc`),
    rows(sql`select coalesce(p.name,'—') as name, count(*)::float8 as n, sum(o.amount_usd)::float8 as value from orders o left join plans p on p.id=o.plan_id where o.status='paid' and o.paid_at >= ${T(from)} ${koc} group by p.name order by value desc`),
    rows(sql`select upper(pay_currency) as name, sum(amount_usd)::float8 as value, count(*)::float8 as n from orders where status='paid' and paid_at >= ${T(from)} ${kc} group by pay_currency order by value desc limit 8`),
    rows(sql`select status as name, count(*)::float8 as value from users group by status order by value desc`),
    rows(sql`select count(*)::float8 as users, (count(*) filter (where status='active'))::float8 as active, (count(*) filter (where status='active' and expires_at < ${T(new Date(now.getTime() + 7 * 86400000))}))::float8 as expiring, (count(*) filter (where last_online_at > ${T(new Date(now.getTime() - 5 * 60000))}))::float8 as online, (select count(*) from orders where status in ('pending','confirming'))::float8 as pending, (select coalesce(sum(p.price_usd*30.0/p.duration_days),0) from users u join plans p on p.id=u.plan_id where u.status='active')::float8 as mrr, (select coalesce(sum(used_bytes),0) from users)::float8 as usedTotal from users`),
    rows(sql`select id, name, country_code as cc, city, status, cpu, ram, users_count as users, capacity_mbps as cap, rx_bps as rx, tx_bps as tx, role, is_local as local from nodes order by users_count desc limit 10`),
    rows(sql`select o.id, o.kind, o.amount_usd as amount, o.pay_currency as currency, o.status, o.created_at as "createdAt", coalesce(p.name,'—') as plan, o.username from orders o left join plans p on p.id=o.plan_id order by o.created_at desc limit 12`),
    rows(sql`select username, used_bytes as used, data_limit_bytes as "limit", status from users order by used_bytes desc limit 8`),
    rows(sql`select s.id, s.username, s.protocol, s.country, s.device, s.up_bytes as up, s.down_bytes as down, s.started_at as "startedAt", s.client_ip as ip, n.name as node from vpn_sessions s left join nodes n on n.id=s.node_id where true ${pcs} order by s.started_at desc limit 30`),
    rows(sql`select count(*)::float8 as n from vpn_sessions s where true ${pcs}`),
  ]);

  const rev = fill(orderRows, "rev");
  const ord = fill(orderRows, "n");
  const ren = fill(orderRows, "renews");
  const nu = fill(userRows, "n");
  const up = fill(trafficRows, "up");
  const down = fill(trafficRows, "down");
  const conns = fill(trafficRows, "conns");
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const revenue = sum(rev);
  const orderCount = sum(ord);
  const renews = sum(ren);
  const traffic = sum(up) + sum(down);
  const po = prevOrders[0] || { rev: 0, n: 0, renews: 0 };
  const tot = totals[0] || {};
  const aovSpark = rev.map((r, i) => (ord[i] ? r / ord[i] : 0));
  const rrNow = orderCount ? (renews / orderCount) * 100 : 0;
  const rrPrev = po.n ? (po.renews / po.n) * 100 : 0;
  const system = await sampleSystem();

  return Response.json({
    range, protocol, kind, unit, labels, generatedAt: Date.now(),
    kpi: {
      revenue: { value: revenue, prev: po.rev, spark: rev },
      orders: { value: orderCount, prev: po.n, spark: ord },
      newUsers: { value: sum(nu), prev: prevUsers[0]?.n || 0, spark: nu },
      traffic: { value: traffic, prev: prevTraffic[0]?.total || 0, spark: up.map((u, i) => u + down[i]) },
      online: { value: tot.online || 0, total: tot.users || 0, spark: conns },
      aov: { value: orderCount ? revenue / orderCount : 0, prev: po.n ? po.rev / po.n : 0, spark: aovSpark },
      renewal: { value: rrNow, prev: rrPrev, spark: ren.map((r, i) => (ord[i] ? (r / ord[i]) * 100 : 0)) },
      mrr: { value: tot.mrr || 0, active: tot.active || 0, expiring: tot.expiring || 0, pending: tot.pending || 0 },
    },
    traffic: { up, down },
    revenue: rev,
    orders: ord,
    protocols: protoDist,
    plans: planDist,
    coins: coinDist,
    statuses: statusDist,
    nodes: nodeRows,
    recentOrders: recent,
    topUsers: top,
    sessions: sess,
    sessionCount: sessCount[0]?.n || 0,
    system: { cpu: system.cpu, mem: system.mem, disk: system.disk, rxBps: system.rxBps, txBps: system.txBps, load: system.load, uptime: system.uptime },
  });
}
