/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { getAdmin, unauthorized } from "@/lib/auth";
import { ENTITIES, omitFields, sanitize } from "@/lib/entities";
import { pickTunnelPort, scheduleApply } from "@/lib/cores";
import { createUser, GB } from "@/lib/users";
import { plans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { token, uuid, x25519, shortId, isOvpnPki, openvpnTunnelPki } from "@/lib/keys";
import { normalizeInbound, normalizeTunnel } from "@/lib/compat";
import { tunnels } from "@/db/schema";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ entity: string }> };

export async function GET(req: Request, ctx: Ctx) {
  if (!(await getAdmin())) return unauthorized();
  const { entity } = await ctx.params;
  const ent = ENTITIES[entity];
  if (!ent) return Response.json({ error: "not_found" }, { status: 404 });
  const limit = Math.min(5000, Number(new URL(req.url).searchParams.get("limit") || 2000));
  let q: any = db.select().from(ent.table);
  if (ent.order) q = q.orderBy(ent.order);
  const rows = await q.limit(limit);
  return Response.json(rows.map((r: any) => omitFields(ent, r)));
}

export async function POST(req: Request, ctx: Ctx) {
  if (!(await getAdmin())) return unauthorized();
  const { entity } = await ctx.params;
  const ent = ENTITIES[entity];
  if (!ent || ent.noCreate) return Response.json({ error: "not_found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, any>;
  try {
    if (entity === "users") {
      const data: any = sanitize({ ...ent, readonly: ["id", "createdAt"] }, body);
      const raw = body.password ? String(body.password) : undefined;
      if (data.planId) {
        const [plan] = await db.select().from(plans).where(eq(plans.id, data.planId));
        if (plan) {
          data.expiresAt ??= new Date(Date.now() + plan.durationDays * 86400000);
          if (!body.dataLimitBytes) data.dataLimitBytes = plan.dataLimitGb * GB;
          if (!body.speedLimitMbps) data.speedLimitMbps = plan.speedLimitMbps;
          if (!body.deviceLimit) data.deviceLimit = plan.deviceLimit;
        }
      }
      const { user, password } = await createUser({ ...data, rawPassword: raw });
      if (user.planId)
        await db.insert(subscriptions).values({ userId: user.id, planId: user.planId, startsAt: new Date(), endsAt: user.expiresAt || new Date(), priceUsd: 0, dataLimitBytes: user.dataLimitBytes });
      scheduleApply();
      return Response.json({ ...omitFields(ent, user), generatedPassword: raw ? undefined : password });
    }
    const data: any = sanitize(ent, body);
    if (entity === "inbounds") {
      normalizeInbound(data);
      if (data.tunnelId) {
        const [tn] = await db.select().from(tunnels).where(eq(tunnels.id, Number(data.tunnelId)));
        if (tn) data.nodeId = tn.entryNodeId; else data.tunnelId = null;
      }
      if (data.security === "reality" && !data.privateKey) {
        const k = x25519();
        data.privateKey = k.privateKeyUrl;
        data.publicKey = k.publicKeyUrl;
        data.shortId ||= shortId();
      }
      if (data.protocol === "wireguard" && !data.privateKey) {
        const k = x25519();
        data.privateKey = k.privateKey;
        data.publicKey = k.publicKey;
      }
      if (data.hidden && (!data.path || data.path === "/")) data.path = `/${token(10).toLowerCase()}`;
    }
    if (entity === "tunnels") {
      normalizeTunnel(data);
      if (data.mode === "reverse" && ["vless", "vmess", "trojan"].includes(String(data.carrier || ""))) {
        // Only Xray carriers use the simplified VLESS reverse proxy in Xray 26.
        // WireGuard/Hysteria2/OpenVPN/Psiphon keep their own carrier and installer.
        data.carrier = "vless";
        if (data.transport === "udp") data.transport = "tcp";
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(data.secret || ""))) data.secret = uuid();
      }
      if (data.carrier === "wireguard") {
        if (!data.privateKey) {
          const entry = x25519();
          data.privateKey = entry.privateKey;
          data.publicKey = entry.publicKey;
        }
        let hasExit = false;
        try { const parsed = JSON.parse(String(data.secret || "")); hasExit = !!(parsed.exitPrivateKey && parsed.exitPublicKey); } catch { /* generate below */ }
        if (!hasExit) {
          const exit = x25519();
          data.secret = JSON.stringify({ exitPrivateKey: exit.privateKey, exitPublicKey: exit.publicKey });
        }
        data.transport = "udp";
        data.security = "none";
      } else data.secret ||= data.carrier === "trojan" ? token(20) : uuid();
      if (data.carrier === "hysteria2") { data.transport = "udp"; data.security = "tls"; }
      if (data.carrier === "openvpn") {
        data.security = "tls";
        if (!isOvpnPki(String(data.secret || ""))) data.secret = openvpnTunnelPki(0);
      }
      if (data.security === "reality" && !data.privateKey) {
        const k = x25519();
        data.privateKey = k.privateKeyUrl;
        data.publicKey = k.publicKeyUrl;
        data.shortId ||= shortId();
      }
    }
    if (entity === "tunnels") data.listenPort = await pickTunnelPort({ carrier: data.carrier, mode: data.mode, transport: data.transport, entryNodeId: data.entryNodeId ?? null, exitNodeId: data.exitNodeId ?? null, listenPort: Number(data.listenPort) || 4443 });
    if (entity === "nodes") { data.agentToken = token(32); data.status = "pending"; data.lastSeenAt = null; }
    if (entity === "posts" && !data.slug) data.slug = `post-${token(6).toLowerCase()}`;
    const res = (await (db.insert(ent.table) as any).values(data).returning()) as any[];
    if (ent.apply) scheduleApply();
    return Response.json(omitFields(ent, res[0]));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 400 });
  }
}
