import { eq } from "drizzle-orm";
import { db } from "@/db";
import { nodes, tunnels } from "@/db/schema";
import { originOf } from "@/lib/http";
import { loadCtx, previewConfig } from "@/lib/cores";
import { buildTunnelInstallScript, validTunnelInstallKey, type TunnelSide } from "@/lib/tunnel-install";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("tunnel") || 0);
  const side = url.searchParams.get("side") as TunnelSide;
  const key = url.searchParams.get("key") || "";
  if (!id || !["entry", "exit"].includes(side) || !validTunnelInstallKey(id, side, key)) return new Response("forbidden", { status: 403 });
  const [t] = await db.select().from(tunnels).where(eq(tunnels.id, id)).limit(1);
  if (!t) return new Response("not found", { status: 404 });
  const [entryNode] = t.entryNodeId ? await db.select().from(nodes).where(eq(nodes.id, t.entryNodeId)).limit(1) : [];
  const [exitNode] = t.exitNodeId ? await db.select().from(nodes).where(eq(nodes.id, t.exitNodeId)).limit(1) : [];
  const ctx = await loadCtx();
  const script = buildTunnelInstallScript({
    t, side, entryNode, exitNode, panel: originOf(req), key,
    wgMtu: ctx.wg.mtu,
    psiphonConfig: await previewConfig("psiphon"),
  });
  return new Response(script, { headers: { "content-type": "text/x-shellscript; charset=utf-8", "cache-control": "no-store" } });
}
