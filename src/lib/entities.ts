/* eslint-disable @typescript-eslint/no-explicit-any */
import { desc, asc, getTableColumns } from "drizzle-orm";
import { cleanIps, inbounds, logs, nodes, orders, plans, posts, routingRules, subscriptions, tunnels, users, vpnSessions } from "@/db/schema";

export type Ent = {
  table: any;
  order?: any;
  readonly?: string[];
  omit?: string[];
  noCreate?: boolean;
  apply?: boolean;
};

export const ENTITIES: Record<string, Ent> = {
  users: { table: users, order: desc(users.createdAt), readonly: ["id", "createdAt", "passwordHash", "subToken", "uuid", "wgPrivateKey", "wgPublicKey"], omit: ["passwordHash"] },
  plans: { table: plans, order: asc(plans.sortOrder) },
  subscriptions: { table: subscriptions, order: desc(subscriptions.createdAt) },
  orders: { table: orders, order: desc(orders.createdAt), noCreate: true },
  nodes: { table: nodes, order: asc(nodes.id), readonly: ["id", "createdAt", "agentToken", "agentConfigHash", "isLocal", "cpu", "ram", "load", "rxBps", "txBps", "lastSeenAt", "xrayActive", "agentError", "agentVersion", "certSha256", "status"], apply: true },
  tunnels: { table: tunnels, order: asc(tunnels.id), readonly: ["id", "createdAt", "entrySeenAt", "exitSeenAt", "trafficBytes", "latencyMs", "status", "statusDetail", "entryOk", "exitOk"], apply: true },
  inbounds: { table: inbounds, order: asc(inbounds.id), apply: true },
  routing_rules: { table: routingRules, order: asc(routingRules.priority), apply: true },
  sessions: { table: vpnSessions, order: desc(vpnSessions.startedAt), noCreate: true },
  clean_ips: { table: cleanIps, order: asc(cleanIps.latencyMs), apply: true },
  posts: { table: posts, order: desc(posts.createdAt) },
  logs: { table: logs, order: desc(logs.ts), noCreate: true },
};

/** Keep only real, writable columns and coerce values to their column types. */
export function sanitize(ent: Ent, body: Record<string, any>): Record<string, any> {
  const cols = getTableColumns(ent.table) as Record<string, any>;
  const ro = new Set(["id", "createdAt", ...(ent.readonly || [])]);
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(body || {})) {
    const col = cols[k];
    if (!col || ro.has(k) || v === undefined) continue;
    const t = col.dataType as string;
    const nullable = !col.notNull;
    if (v === null || v === "") {
      if (nullable) out[k] = null;
      else if (t === "string") out[k] = "";
      continue;
    }
    if (t === "number") {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = col.columnType === "PgInteger" || col.columnType === "PgSerial" || col.columnType === "PgBigInt53" ? Math.round(n) : n;
    } else if (t === "boolean") out[k] = v === true || v === "true" || v === 1;
    else if (t === "date") {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) out[k] = d;
    } else if (t === "json") out[k] = typeof v === "string" ? safeJson(v) : v;
    else out[k] = String(v).slice(0, 20000);
  }
  return out;
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

export function omitFields(ent: Ent, row: Record<string, any>) {
  if (!row) return row;
  if (!ent.omit?.length) return row;
  const out = { ...row };
  for (const k of ent.omit) delete out[k];
  return out;
}
