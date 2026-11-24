import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tunnels } from "@/db/schema";
import { refreshTunnelStatuses } from "@/lib/cores";
import { validTunnelInstallKey, type TunnelSide } from "@/lib/tunnel-install";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { tunnelId?: number; side?: TunnelSide; active?: boolean; connected?: boolean; latencyMs?: number };
  const id = Number(body.tunnelId || 0);
  const side = body.side;
  const key = req.headers.get("x-tunnel-key") || "";
  if (!id || (side !== "entry" && side !== "exit") || !validTunnelInstallKey(id, side, key)) return Response.json({ error: "forbidden" }, { status: 403 });
  const [t] = await db.select().from(tunnels).where(eq(tunnels.id, id)).limit(1);
  if (!t) return Response.json({ error: "not_found" }, { status: 404 });
  if (body.active === true) {
    const ms = body.connected ? Math.max(1, Math.round(Number(body.latencyMs) || 1)) : 0;
    await db.update(tunnels).set(side === "entry" ? { entrySeenAt: new Date(), ...(typeof body.connected === "boolean" ? { latencyMs: ms } : {}) } : { exitSeenAt: new Date() }).where(eq(tunnels.id, id));
  } else {
    // service reported as stopped: clear the side's heartbeat so the status flips immediately
    await db.update(tunnels).set(side === "entry" ? { entrySeenAt: null, latencyMs: 0 } : { exitSeenAt: null }).where(eq(tunnels.id, id));
  }
  await refreshTunnelStatuses().catch(() => {});
  return Response.json({ ok: true });
}
