import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, users } from "@/db/schema";
import { userLinks } from "@/lib/links";
import { subscriptionOriginOf } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import { isUsable } from "@/lib/users";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const [u] = await db.select().from(users).where(eq(users.subToken, token)).limit(1);
  if (!u) return Response.json({ error: "not_found" }, { status: 404 });
  const origin = await subscriptionOriginOf(req);
  const [plan] = u.planId ? await db.select().from(plans).where(eq(plans.id, u.planId)) : [];
  const [sub, gen] = await Promise.all([getSettings("subscription"), getSettings("general")]);
  const links = isUsable(u) ? await userLinks(u, origin) : [];
  return Response.json({
    username: u.username,
    status: isUsable(u) ? "active" : u.status === "active" ? "expired" : u.status,
    expiresAt: u.expiresAt,
    used: u.usedBytes,
    limit: u.dataLimitBytes,
    deviceLimit: u.deviceLimit,
    plan: plan?.name || "",
    links,
    openVpnCredentials: links.some((link) => link.protocol === "openvpn") ? { username: u.username, password: u.vpnPassword } : null,
    subUrl: `${origin}/sub/${u.subToken}`,
    origin,
    settings: {
      template: sub.template,
      allowUserTemplate: sub.allowUserTemplate,
      announce: sub.announce,
      showUsage: sub.showUsage,
      showQr: sub.showQr,
      showApps: sub.showApps,
      footer: sub.footer,
      supportLink: sub.supportLink || gen.supportUrl,
      title: sub.profileTitle,
    },
  });
}
