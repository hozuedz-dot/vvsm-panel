import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, plans, users } from "@/db/schema";
import { clearSessionCookie, getPortalUser, hashPassword, previewNoLogin, unauthorized } from "@/lib/auth";
import { userLinks } from "@/lib/links";
import { subscriptionOriginOf } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import { token } from "@/lib/keys";
import { ensureBootstrap } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureBootstrap();
  const u = await getPortalUser();
  if (!u) return unauthorized();
  const origin = await subscriptionOriginOf(req);
  const [plan] = u.planId ? await db.select().from(plans).where(eq(plans.id, u.planId)) : [];
  const ords = await db.select().from(orders).where(eq(orders.userId, u.id)).orderBy(desc(orders.createdAt)).limit(10);
  const sub = await getSettings("subscription");
  return Response.json({
    username: u.username,
    preview: previewNoLogin(),
    status: u.status,
    expiresAt: u.expiresAt,
    used: u.usedBytes,
    limit: u.dataLimitBytes,
    plan: plan ? { id: plan.id, name: plan.name } : null,
    subUrl: `${origin}/sub/${u.subToken}`,
    pageUrl: `${origin}/s/${u.subToken}`,
    links: await userLinks(u, origin),
    orders: ords.map((o) => ({ id: o.id, kind: o.kind, status: o.status, amountUsd: o.amountUsd, createdAt: o.createdAt, currency: o.payCurrency })),
    allowTokenReset: sub.allowTokenReset,
  });
}

export async function POST(req: Request) {
  const u = await getPortalUser();
  if (!u) return unauthorized();
  const b = (await req.json().catch(() => ({}))) as { action?: string; password?: string };
  if (b.action === "set-password") {
    if (!b.password || b.password.length < 8) return Response.json({ error: "weak_password" }, { status: 400 });
    await db.update(users).set({ passwordHash: hashPassword(b.password) }).where(eq(users.id, u.id));
    return Response.json({ ok: true });
  }
  if (b.action === "reset-token") {
    if (!(await getSettings("subscription")).allowTokenReset) return Response.json({ error: "not_allowed" }, { status: 403 });
    await db.update(users).set({ subToken: token(24) }).where(eq(users.id, u.id));
    return Response.json({ ok: true });
  }
  return Response.json({ error: "unknown_action" }, { status: 400 });
}

export async function DELETE() {
  await clearSessionCookie("vvsm_user");
  return Response.json({ ok: true });
}
