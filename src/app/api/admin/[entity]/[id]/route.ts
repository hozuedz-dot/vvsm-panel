/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { inbounds, nodes, subscriptions, tunnels, users } from "@/db/schema";
import { getAdmin, hashPassword, unauthorized } from "@/lib/auth";
import { ENTITIES, omitFields, sanitize } from "@/lib/entities";
import { pickTunnelPort, scheduleApply } from "@/lib/cores";
import { uuid, x25519, isOvpnPki, openvpnTunnelPki, shortId as newShortId } from "@/lib/keys";
import { normalizeInbound, normalizeTunnel } from "@/lib/compat";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ entity: string; id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  if (!(await getAdmin())) return unauthorized();
  const { entity, id } = await ctx.params;
  const ent = ENTITIES[entity];
  if (!ent) return Response.json({ error: "not_found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, any>;
  const data: any = sanitize(ent, body);
  if (entity === "users" && body.password) data.passwordHash = hashPassword(String(body.password));
  if (entity === "tunnels" && (body.mode === "reverse" || body.carrier)) {
    const [current] = await db.select().from(tunnels).where(eq(tunnels.id, Number(id))).limit(1);
    const mode = body.mode || current?.mode;
    if (mode === "reverse" && ["vless", "vmess", "trojan"].includes(String(body.carrier || current?.carrier || ""))) {
      data.carrier = "vless";
      if ((body.transport || current?.transport) === "udp") data.transport = "tcp";
      const secret = body.secret || current?.secret || "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(secret)) data.secret = uuid();
    } else if (data.carrier === "wireguard" || (body.carrier === undefined && current?.carrier === "wireguard" && body.transport)) {
      if (!current?.privateKey && !body.privateKey) { const entry = x25519(); data.privateKey = entry.privateKey; data.publicKey = entry.publicKey; }
      let hasExit = false;
      try { const parsed = JSON.parse(String(body.secret || current?.secret || "")); hasExit = !!(parsed.exitPrivateKey && parsed.exitPublicKey); } catch { /* generate */ }
      if (!hasExit) { const exit = x25519(); data.secret = JSON.stringify({ exitPrivateKey: exit.privateKey, exitPublicKey: exit.publicKey }); }
      data.transport = "udp"; data.security = "none";
    } else if (data.carrier === "openvpn") {
      data.security = "tls";
      if (!isOvpnPki(String(body.secret || current?.secret || ""))) data.secret = openvpnTunnelPki(Number(id));
    }
  }
  if (entity === "inbounds" || entity === "tunnels") {
    const tbl = entity === "inbounds" ? inbounds : tunnels;
    const [cur] = (await db.select().from(tbl).where(eq(tbl.id, Number(id))).limit(1)) as any[];
    if (cur) {
      const merged = { ...cur, ...data };
      if (entity === "inbounds") {
        normalizeInbound(merged);
        if (merged.tunnelId) {
          const [tn] = await db.select().from(tunnels).where(eq(tunnels.id, Number(merged.tunnelId)));
          if (tn) merged.nodeId = tn.entryNodeId; else merged.tunnelId = null;
        }
        if (merged.security === "reality" && (!merged.privateKey || !merged.publicKey)) { const k = x25519(); merged.privateKey = k.privateKeyUrl; merged.publicKey = k.publicKeyUrl; merged.shortId ||= newShortId(); }
        if (merged.protocol === "wireguard" && (!merged.privateKey || merged.privateKey.includes("-") || merged.privateKey.includes("_"))) { const k = x25519(); merged.privateKey = k.privateKey; merged.publicKey = k.publicKey; }
      } else {
        normalizeTunnel(merged);
        const port = await pickTunnelPort({ id: cur.id, carrier: merged.carrier, mode: merged.mode, transport: merged.transport, entryNodeId: merged.entryNodeId ?? null, exitNodeId: merged.exitNodeId ?? null, listenPort: Number(merged.listenPort) || 4443 });
        if (port !== cur.listenPort || "listenPort" in data) data.listenPort = port;
        if (merged.security === "reality" && (!merged.privateKey || !merged.publicKey) && merged.carrier !== "wireguard") { const k = x25519(); merged.privateKey = k.privateKeyUrl; merged.publicKey = k.publicKeyUrl; merged.shortId ||= newShortId(); }
      }
      for (const k of ["protocol", "carrier", "mode", "transport", "security", "flow", "hidden", "listen", "useCleanIp", "nodeId", "tunnelId", "privateKey", "publicKey", "shortId"]) if (k in merged && merged[k] !== cur[k]) data[k] = merged[k];
    }
  }
  if (entity === "posts") data.updatedAt = new Date();
  if (!Object.keys(data).length) return Response.json({ error: "nothing_to_update" }, { status: 400 });
  try {
    const [row] = await db.update(ent.table).set(data).where(eq(ent.table.id, entity === "orders" ? id : Number(id))).returning();
    if (ent.apply || (entity === "users" && ("status" in data || "expiresAt" in data || "planId" in data))) scheduleApply();
    return Response.json(row ? omitFields(ent, row as any) : {});
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  if (!(await getAdmin())) return unauthorized();
  const { entity, id } = await ctx.params;
  const ent = ENTITIES[entity];
  if (!ent) return Response.json({ error: "not_found" }, { status: 404 });
  const key = entity === "orders" ? id : Number(id);
  if (entity === "users") await db.delete(subscriptions).where(eq(subscriptions.userId, Number(id)));
  if (entity === "nodes") {
    const [n] = await db.select().from(nodes).where(eq(nodes.id, Number(id)));
    if (n?.isLocal) return Response.json({ error: "cannot_delete_local" }, { status: 400 });
    await db.update(inbounds).set({ nodeId: null }).where(eq(inbounds.nodeId, Number(id)));
    await db.delete(tunnels).where(and(inArray(tunnels.entryNodeId, [Number(id)])));
    await db.delete(tunnels).where(eq(tunnels.exitNodeId, Number(id)));
  }
  if (entity === "tunnels") await db.update(inbounds).set({ tunnelId: null }).where(eq(inbounds.tunnelId, Number(id)));
  await db.delete(ent.table).where(eq(ent.table.id, key));
  void users;
  if (ent.apply || entity === "users") scheduleApply();
  return Response.json({ ok: true });
}
