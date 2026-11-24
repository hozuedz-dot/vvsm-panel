/* eslint-disable @typescript-eslint/no-explicit-any */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, plans } from "@/db/schema";
import { activeProvider, fulfillOrder, refreshOrder } from "@/lib/payments";
import { getSettings } from "@/lib/settings";
import { subscriptionOriginOf } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function view(id: string, req: Request) {
  const [found] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!found) return null;
  const o = await refreshOrder(found);
  const [plan] = o.planId ? await db.select().from(plans).where(eq(plans.id, o.planId)) : [];
  const meta = o.meta as any;
  let credentials: any = null;
  if (o.status === "paid" && meta?.credentials) {
    credentials = { username: meta.credentials.username, password: meta.credentials.password, subToken: meta.credentials.subToken };
    if (meta.credentials.password && !meta.credentialsShown) {
      // reveal the generated password only once
      await db.update(orders).set({ meta: { ...meta, credentialsShown: true, credentials: { username: meta.credentials.username, subToken: meta.credentials.subToken } } }).where(eq(orders.id, o.id));
    } else credentials.password = undefined;
  }
  const testMode = o.provider === "test" && (await getSettings("payments")).testMode && (await activeProvider()) === "test";
  return {
    id: o.id,
    kind: o.kind,
    status: o.status,
    plan: plan ? { name: plan.name, durationDays: plan.durationDays, dataLimitGb: plan.dataLimitGb } : null,
    amountUsd: o.amountUsd,
    payAmount: o.payAmount,
    payCurrency: o.payCurrency,
    network: o.network,
    payAddress: o.payAddress,
    memo: meta?.memo || "",
    provider: o.provider,
    expiresAt: o.expiresAt,
    txHash: o.txHash,
    testMode,
    credentials,
    subscriptionPageUrl: credentials?.subToken ? `${await subscriptionOriginOf(req)}/s/${credentials.subToken}` : null,
  };
}

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const v = await view(id, req);
  return v ? Response.json(v) : Response.json({ error: "not_found" }, { status: 404 });
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { action?: string };
  if (b.action === "simulate") {
    const [o] = await db.select().from(orders).where(eq(orders.id, id));
    const st = (await getSettings("payments")).testMode;
    if (!o || o.provider !== "test" || !st || o.status === "paid") return Response.json({ error: "not_allowed" }, { status: 400 });
    await fulfillOrder(id, `test-${Date.now().toString(16)}`);
  }
  const v = await view(id, req);
  return v ? Response.json(v) : Response.json({ error: "not_found" }, { status: 404 });
}
