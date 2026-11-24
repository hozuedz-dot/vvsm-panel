import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { buildSubscription } from "@/lib/links";
import { subscriptionOriginOf } from "@/lib/http";
import { isUsable } from "@/lib/users";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const [u] = await db.select().from(users).where(eq(users.subToken, token)).limit(1);
  if (!u) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  const accept = req.headers.get("accept") || "";
  let format = url.searchParams.get("format") || "";
  const isClient = /(v2ray|xray|clash|mihomo|stash|sing-box|sfa|sfi|hiddify|streisand|shadowrocket|nekobox|nekoray|karing|happ|quantumult|surge|loon|v2box|foxray|wireguard|openvpn)/.test(ua);
  if (!format && !isClient && accept.includes("text/html")) return Response.redirect(new URL(`/s/${token}`, await subscriptionOriginOf(req)), 302);
  if (!format) format = /(clash|mihomo|stash)/.test(ua) ? "clash" : /(sing-box|sfa|sfi)/.test(ua) ? "singbox" : "base64";
  const r = await buildSubscription(u, format, await subscriptionOriginOf(req));
  const body = isUsable(u) ? r.body : "";
  return new Response(body, { headers: { "content-type": r.type, ...r.headers } });
}
