import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { buildSubscription } from "@/lib/links";
import { subscriptionOriginOf } from "@/lib/http";
import { isUsable } from "@/lib/users";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string; kind: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { token, kind } = await ctx.params;
  if (!["clash", "singbox", "xray", "wg", "ovpn", "links", "base64"].includes(kind)) return new Response("Not found", { status: 404 });
  const [u] = await db.select().from(users).where(eq(users.subToken, token)).limit(1);
  if (!u) return new Response("Not found", { status: 404 });
  const r = await buildSubscription(u, kind, await subscriptionOriginOf(req));
  return new Response(isUsable(u) ? r.body : "", { headers: { "content-type": r.type, ...r.headers } });
}
