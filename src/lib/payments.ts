/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, plans, subscriptions, users } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { createUser, GB } from "@/lib/users";
import { hashPassword } from "@/lib/auth";
import { logEvent, notify } from "@/lib/telegram";
import { scheduleApply } from "@/lib/cores";

type Order = typeof orders.$inferSelect;
const USDT_TRC20 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const NAMES: Record<string, [string, string]> = {
  usdttrc20: ["USDT", "TRC20"], usdtbsc: ["USDT", "BEP20"], usdterc20: ["USDT", "ERC20"], usdcbsc: ["USDC", "BEP20"], btc: ["Bitcoin", "BTC"], eth: ["Ethereum", "ERC20"],
  ltc: ["Litecoin", "LTC"], trx: ["TRON", "TRC20"], ton: ["Toncoin", "TON"], bnbbsc: ["BNB", "BEP20"], doge: ["Dogecoin", "DOGE"], xmr: ["Monero", "XMR"], sol: ["Solana", "SOL"],
};

export async function activeProvider(): Promise<"test" | "nowpayments" | "manual" | null> {
  const p = await getSettings("payments");
  if (p.testMode) return "test";
  if (p.provider === "nowpayments" && p.nowpayments.apiKey) return "nowpayments";
  if (p.provider === "manual" && p.manual.usdtTrc20Address) return "manual";
  return null;
}

export async function paymentOptions() {
  const p = await getSettings("payments");
  const prov = await activeProvider();
  const ids = prov === "manual" ? ["usdttrc20"] : p.currencies;
  return {
    enabled: !!prov, provider: prov, testMode: p.testMode, allowNew: p.allowNew, allowRenew: p.allowRenew,
    currencies: ids.map((id) => ({ id, name: NAMES[id]?.[0] || id.toUpperCase(), label: NAMES[id]?.[0] || id.toUpperCase(), network: NAMES[id]?.[1] || "" })),
  };
}

const nowBase = (sandbox: boolean) => (sandbox ? "https://api-sandbox.nowpayments.io/v1" : "https://api.nowpayments.io/v1");

export async function createOrder(o: { kind: "new" | "renew"; planId: number; userId: number | null; email: string; username: string; password?: string; currency: string }) {
  const p = await getSettings("payments");
  const prov = await activeProvider();
  if (!prov) throw new Error("payments_unavailable");
  if (o.kind === "new" && !p.allowNew) throw new Error("purchases_disabled");
  if (o.kind === "renew" && !p.allowRenew) throw new Error("renewals_disabled");
  const m = await getSettings("maintenance");
  if (m.enabled && !m.allowNew && o.kind === "new") throw new Error("purchases_disabled");
  const [plan] = await db.select().from(plans).where(eq(plans.id, o.planId)).limit(1);
  if (!plan || !plan.active) throw new Error("plan_not_found");
  const opts = await paymentOptions();
  if (!opts.currencies.some((c) => c.id === o.currency)) throw new Error("currency_not_supported");
  const username = o.username.trim().toLowerCase();
  if (o.kind === "new") {
    const [ex] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
    if (ex) throw new Error("invalid_username");
  }
  const id = crypto.randomUUID();
  const base = {
    id, kind: o.kind, userId: o.userId, planId: plan.id, email: o.email, username: o.kind === "new" ? username : "", amountUsd: plan.priceUsd, payCurrency: o.currency,
    expiresAt: new Date(Date.now() + p.invoiceTtlMin * 60000), meta: o.kind === "new" && o.password ? { passwordHash: hashPassword(o.password) } : {},
  };
  if (o.kind === "renew" && o.userId) {
    const [u] = await db.select({ username: users.username }).from(users).where(eq(users.id, o.userId));
    base.username = u?.username || "";
  }
  let row: typeof orders.$inferInsert;
  if (prov === "test") row = { ...base, provider: "test", payAmount: String(plan.priceUsd), payAddress: "TEST-WALLET-NO-REAL-PAYMENT", network: NAMES[o.currency]?.[1] || "" };
  else if (prov === "manual") {
    const amount = (plan.priceUsd + Math.floor(1 + Math.random() * 98) / 10000).toFixed(4);
    row = { ...base, provider: "manual", payAmount: amount, payAddress: p.manual.usdtTrc20Address, network: "TRC20" };
  } else {
    const r = await fetch(`${nowBase(p.nowpayments.sandbox)}/payment`, {
      method: "POST", headers: { "x-api-key": p.nowpayments.apiKey, "content-type": "application/json" }, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ price_amount: plan.priceUsd, price_currency: "usd", pay_currency: o.currency, order_id: id, order_description: `${plan.name} (${o.kind})`, ipn_callback_url: `${process.env.PUBLIC_URL || ""}/api/pay/nowpayments/ipn` }),
    }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as any;
    if (!r?.ok || !j?.pay_address) { await logEvent("warn", "payments", `NOWPayments create failed: ${JSON.stringify(j).slice(0, 200)}`); throw new Error("provider_error"); }
    row = { ...base, provider: "nowpayments", providerRef: String(j.payment_id), payAmount: String(j.pay_amount), payAddress: j.pay_address, network: (j.network || NAMES[o.currency]?.[1] || "").toUpperCase(), meta: { ...base.meta, memo: j.payin_extra_id || "" } };
  }
  const [saved] = await db.insert(orders).values(row).returning();
  await logEvent("info", "payments", `order ${id} created (${o.kind}, ${plan.name}, ${row.provider})`);
  return saved;
}

const lastCheck = new Map<string, number>();

export async function refreshOrder(o: Order): Promise<Order> {
  if (!["pending", "confirming"].includes(o.status)) return o;
  if (o.expiresAt && o.expiresAt.getTime() < Date.now() && o.status === "pending") {
    const [u] = await db.update(orders).set({ status: "expired" }).where(eq(orders.id, o.id)).returning();
    return u || o;
  }
  if (Date.now() - (lastCheck.get(o.id) || 0) < 20000) return o;
  lastCheck.set(o.id, Date.now());
  const p = await getSettings("payments");
  try {
    if (o.provider === "nowpayments" && o.providerRef) {
      const r = await fetch(`${nowBase(p.nowpayments.sandbox)}/payment/${o.providerRef}`, { headers: { "x-api-key": p.nowpayments.apiKey }, signal: AbortSignal.timeout(10000) });
      const j = (await r.json()) as { payment_status?: string };
      if (j.payment_status) await applyNowStatus(o.id, j.payment_status);
    } else if (o.provider === "manual" && o.payAddress) {
      const since = o.createdAt.getTime() - 60000;
      const r = await fetch(`https://api.trongrid.io/v1/accounts/${o.payAddress}/transactions/trc20?only_to=true&limit=50&contract_address=${USDT_TRC20}&min_timestamp=${since}`, { headers: p.manual.tronGridKey ? { "TRON-PRO-API-KEY": p.manual.tronGridKey } : {}, signal: AbortSignal.timeout(10000) });
      const j = (await r.json()) as { data?: { transaction_id: string; value: string; block_timestamp: number }[] };
      const want = Math.round(Number(o.payAmount) * 1e6);
      const hit = j.data?.find((tx) => Math.abs(Number(tx.value) - want) <= 1);
      if (hit) {
        const [dup] = await db.select({ id: orders.id }).from(orders).where(eq(orders.txHash, hit.transaction_id)).limit(1);
        if (!dup) await fulfillOrder(o.id, hit.transaction_id);
      }
    }
  } catch (e) {
    await logEvent("warn", "payments", `refresh ${o.id} failed: ${e instanceof Error ? e.message : e}`);
  }
  const [fresh] = await db.select().from(orders).where(eq(orders.id, o.id)).limit(1);
  return fresh || o;
}

export async function applyNowStatus(id: string, status: string) {
  const map: Record<string, string> = { waiting: "pending", confirming: "confirming", confirmed: "confirming", sending: "confirming", partially_paid: "underpaid", failed: "failed", expired: "expired", refunded: "cancelled" };
  if (status === "finished") return fulfillOrder(id);
  if (map[status]) await db.update(orders).set({ status: map[status] }).where(eq(orders.id, id));
  return null;
}

export async function fulfillOrder(id: string, txHash = "") {
  const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!o) return null;
  if (o.fulfilledAt && o.userId) {
    const [u] = await db.select().from(users).where(eq(users.id, o.userId));
    return u ?? null;
  }
  const [plan] = o.planId ? await db.select().from(plans).where(eq(plans.id, o.planId)) : [];
  if (!plan) return null;
  const lim = await getSettings("limits");
  const days = plan.durationDays * 86400000;
  const meta = (o.meta || {}) as any;
  let user: typeof users.$inferSelect | undefined;
  if (o.kind === "renew" && o.userId) {
    const [u] = await db.select().from(users).where(eq(users.id, o.userId));
    if (!u) return null;
    const from = u.expiresAt && u.expiresAt > new Date() ? u.expiresAt : new Date();
    [user] = await db.update(users).set({
      expiresAt: new Date(from.getTime() + days), status: "active", planId: plan.id, dataLimitBytes: plan.dataLimitGb * GB, notifiedExpiry: false,
      speedLimitMbps: plan.speedLimitMbps, deviceLimit: plan.deviceLimit, ...(lim.resetTrafficOnRenew ? { usedBytes: 0, monthUsedBytes: 0 } : {}),
    }).where(eq(users.id, u.id)).returning();
    await notify("renewal", `🔁 Renewal: <b>${u.username}</b> — ${plan.name} ($${o.amountUsd})`);
  } else {
    const r = await createUser({ username: o.username, email: o.email, planId: plan.id, expiresAt: new Date(Date.now() + days), dataLimitBytes: plan.dataLimitGb * GB, speedLimitMbps: plan.speedLimitMbps, deviceLimit: plan.deviceLimit, source: "purchase" });
    user = r.user;
    let password: string | undefined = r.password;
    if (meta.passwordHash) { await db.update(users).set({ passwordHash: meta.passwordHash }).where(eq(users.id, user.id)); password = undefined; }
    meta.credentials = { username: user.username, subToken: user.subToken, ...(password ? { password } : {}) };
    await notify("newOrder", `🛒 New customer: <b>${user.username}</b> — ${plan.name} ($${o.amountUsd} ${o.payCurrency})`);
  }
  if (!user) return null;
  delete meta.passwordHash;
  await db.update(orders).set({ status: "paid", userId: user.id, paidAt: new Date(), fulfilledAt: new Date(), txHash: txHash || o.txHash, meta }).where(eq(orders.id, o.id));
  await db.insert(subscriptions).values({ userId: user.id, planId: plan.id, orderId: o.id, startsAt: new Date(), endsAt: user.expiresAt || new Date(), priceUsd: o.amountUsd, dataLimitBytes: plan.dataLimitGb * GB });
  await logEvent("info", "payments", `order ${o.id} fulfilled for ${user.username}`);
  scheduleApply();
  return user;
}

function sortKeys(v: any): any {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.keys(v).sort().reduce((a: any, k) => ((a[k] = sortKeys(v[k])), a), {});
  return v;
}

export function verifyNowSignature(body: unknown, sig: string, secret: string) {
  if (!secret || !sig) return false;
  const h = crypto.createHmac("sha512", secret).update(JSON.stringify(sortKeys(body))).digest("hex");
  return h.length === sig.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(sig));
}
