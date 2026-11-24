import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { nodes } from "@/db/schema";
import { buildXrayConfig, loadCtx, nodePorts, refreshTunnelStatuses, scheduleApply } from "@/lib/cores";
import { logEvent } from "@/lib/telegram";

export const dynamic = "force-dynamic";

async function nodeFrom(req: Request) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!t) return null;
  const [n] = await db.select().from(nodes).where(eq(nodes.agentToken, t)).limit(1);
  return n ?? null;
}

// Node agents pull their Xray config from here.
export async function GET(req: Request) {
  const n = await nodeFrom(req);
  if (!n || !n.enabled || n.isLocal) return Response.json({ error: "unauthorized" }, { status: 401 });
  const ctx = await loadCtx();
  const config = await buildXrayConfig(n.id, ctx);
  const hash = crypto.createHash("sha256").update(config).digest("hex");
  return Response.json({ config, hash, interval: 30, ports: nodePorts(ctx, n.id) });
}

// ...and push their health/metrics back.
export async function POST(req: Request) {
  const n = await nodeFrom(req);
  if (!n || n.isLocal) return Response.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return Response.json({ error: "bad_json" }, { status: 400 });
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const patch: Partial<typeof n> = {
    cpu: num(b.cpu), ram: num(b.mem), load: num(b.load), rxBps: Math.round(num(b.rxBps)), txBps: Math.round(num(b.txBps)),
    status: "online", lastSeenAt: new Date(), ip: n.ip || req.headers.get("x-forwarded-for")?.split(",")[0].trim() || n.ip,
    agentError: typeof b.error === "string" ? b.error.slice(0, 600) : "",
    agentVersion: typeof b.version === "string" ? b.version.slice(0, 20) : n.agentVersion,
  };
  if (typeof b.configHash === "string" && /^[0-9a-f]{64}$/.test(b.configHash)) patch.agentConfigHash = b.configHash;
  if (typeof b.xrayActive === "boolean") patch.xrayActive = b.xrayActive;
  const cert = typeof b.certSha256 === "string" && /^[0-9a-f]{64}$/.test(b.certSha256) ? b.certSha256 : "";
  if (cert) patch.certSha256 = cert;
  await db.update(nodes).set(patch).where(eq(nodes.id, n.id));
  if (n.status !== "online") await logEvent("info", "nodes", `node ${n.name} is online (agent v${patch.agentVersion || "?"})`);
  if (patch.agentError && patch.agentError !== n.agentError) await logEvent("warn", "nodes", `node ${n.name}: ${patch.agentError}`);
  // a new/changed certificate changes the TLS pin used by the peers → regenerate configs
  if (cert && cert !== n.certSha256) scheduleApply(1500);
  await refreshTunnelStatuses().catch(() => {});
  return Response.json({ ok: true });
}
